import * as io from 'ioium';
import { sql, type Selectable } from 'kysely';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import * as z from 'zod';
import { database, listen } from './db/connection.js';
import type { Schema } from './db/index.js';
import { _unique } from './state.js';

export type State = 'queued' | 'running' | 'failed';

export interface Job<Input = unknown> extends Omit<Selectable<Schema['jobs']>, 'input' | 'state'> {
	input: Input;
	state: State;
}

export interface Context {
	signal: AbortSignal;
	/** Starts at 1 */
	attempt: number;
	key: string | null;
	userId: string | null;
}

export interface Definition<Input> {
	input?: z.ZodType<Input>;
	/** How many jobs of this kind may run at once across all processes */
	concurrency?: number;
	/** How many times a job is attempted before it fails */
	attempts?: number;
	/** Delay before the first retry in milliseconds, doubled for each later retry */
	backoff?: number;
	/** Keep a single job of this kind (keyed `every`) that runs repeatedly, waiting this many milliseconds between runs */
	every?: number;
	/** A returned date reschedules the job instead of removing it */
	run(input: Input, context: Context): Date | void | Promise<Date | void>;
	/** Called once a job has used all of its attempts */
	failed?(input: Input, error: unknown, context: Context): void | Promise<void>;
}

export interface EnqueueOptions {
	/** Identifies the job within its kind, so it can be replaced, cancelled, or found later */
	key?: string;
	userId?: string;
	/** Defaults to now */
	at?: Date;
	/** Replace an existing job with the same key instead of keeping it. Failed jobs are always replaced. */
	replace?: boolean;
}

export interface ListFilter {
	userId?: string;
	state?: State;
}

export interface Kind<Input> {
	readonly name: string;
	enqueue(input: Input, options?: EnqueueOptions): Promise<void>;
	cancel(key: string): Promise<boolean>;
	get(key: string): Promise<Job<Input> | undefined>;
	list(filter?: ListFilter): Promise<Job<Input>[]>;
	retry(key?: string): Promise<number>;
}

/** The Postgres notification channel used to wake runners */
export const channel = 'axium_jobs';

/** The Postgres notification channel used to abort cancelled jobs, with job IDs as payloads */
const cancelChannel = 'axium_jobs_cancel';

const definitions = _unique('jobs', new Map<string, Definition<any>>());

/** In seconds */
const leaseDuration = 60;

/** In milliseconds */
const heartbeatInterval = 20_000;

/** Longest wait between checks for due jobs, in milliseconds */
const longestWait = 60_000;

/** In milliseconds */
const defaultBackoff = 60_000;

const worker = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

const cancelled = new DOMException('The job was cancelled', 'AbortError');
const shutdown = new DOMException('The job runner is stopping', 'AbortError');

const running = new Map<string, AbortController>();

let started = false;
let stopping = false;
let wakeTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let polling: Promise<void> | null = null;
let pollAgain = false;

function after(milliseconds: number) {
	return sql<Date>`now() + make_interval(secs => ${milliseconds / 1000})`;
}

async function notify(payload: string, notificationChannel: string = channel): Promise<void> {
	await sql`SELECT pg_notify(${notificationChannel}, ${payload})`.execute(database);
}

export function define<Input>(kind: string, definition: Definition<Input>): Kind<Input> {
	if (definitions.has(kind)) io.warn(`jobs: ${kind} is already defined, replacing it`);
	definitions.set(kind, definition);

	if (started) {
		void ensureRecurring(kind, definition)
			.then(schedulePoll)
			.catch(error => io.error(`jobs: could not schedule ${kind}:`, io.errorText(error)));
	}

	return {
		name: kind,
		enqueue: (input, options) => enqueue(kind, input, options),
		cancel: key => cancel(kind, key),
		get: key => get<Input>(kind, key),
		list: filter => list<Input>(kind, filter),
		retry: key => retry(kind, key),
	};
}

/** Queue a job. Kinds defined in this process have their input validated. */
export async function enqueue(kind: string, input: unknown, options: EnqueueOptions = {}): Promise<void> {
	const definition = definitions.get(kind);
	if (definition?.input) input = definition.input.parse(input);

	await database
		.insertInto('jobs')
		.values({
			kind,
			key: options.key ?? null,
			userId: options.userId ?? null,
			input: JSON.stringify(input ?? {}),
			runAt: options.at ?? sql<Date>`now()`,
		})
		.onConflict(conflict =>
			conflict
				.columns(['kind', 'key'])
				.doUpdateSet(eb => ({
					input: eb.ref('excluded.input'),
					userId: eb.ref('excluded.userId'),
					runAt: eb.ref('excluded.runAt'),
					state: 'queued',
					attempts: 0,
					lastError: null,
				}))
				.where(eb => (options.replace ? eb('jobs.state', '!=', 'running') : eb('jobs.state', '=', 'failed')))
		)
		.execute();

	await notify(kind);
}

/** Remove a job, aborting it if it is running */
export async function cancel(kind: string, key: string): Promise<boolean> {
	const removed = await database.deleteFrom('jobs').where('kind', '=', kind).where('key', '=', key).returning('id').executeTakeFirst();
	if (!removed) return false;

	running.get(removed.id)?.abort(cancelled);
	await notify(removed.id, cancelChannel);
	return true;
}

export async function get<Input = unknown>(kind: string, key: string): Promise<Job<Input> | undefined> {
	const job = await database.selectFrom('jobs').selectAll().where('kind', '=', kind).where('key', '=', key).executeTakeFirst();
	return job as Job<Input> | undefined;
}

export async function list<Input = unknown>(kind: string, filter: ListFilter = {}): Promise<Job<Input>[]> {
	const jobs = await database
		.selectFrom('jobs')
		.selectAll()
		.where('kind', '=', kind)
		.$if(!!filter.userId, query => query.where('userId', '=', filter.userId!))
		.$if(!!filter.state, query => query.where('state', '=', filter.state!))
		.orderBy('runAt')
		.execute();
	return jobs as Job<Input>[];
}

/** Queue failed jobs again, returning how many were queued */
export async function retry(kind: string, key?: string): Promise<number> {
	const retried = await database
		.updateTable('jobs')
		.set({ state: 'queued', attempts: 0, runAt: sql<Date>`now()` })
		.where('kind', '=', kind)
		.where('state', '=', 'failed')
		.$if(key !== undefined, query => query.where('key', '=', key!))
		.returning('id')
		.execute();

	if (retried.length) await notify(kind);
	return retried.length;
}

async function ensureRecurring(kind: string, definition: Definition<any>): Promise<void> {
	if (!definition.every) return;

	await database
		.insertInto('jobs')
		.values({ kind, key: 'every', input: '{}' })
		.onConflict(conflict => conflict.columns(['kind', 'key']).doNothing())
		.execute();
}

/** Claim due jobs of a kind, up to its free capacity across all processes */
async function claim(kind: string, definition: Definition<any>): Promise<Job[]> {
	const concurrency = definition.concurrency ?? 1;

	return await database.transaction().execute(async tx => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${channel}), hashtext(${kind}))`.execute(tx);

		const { count } = await tx
			.selectFrom('jobs')
			.select(eb => eb.fn.countAll().as('count'))
			.where('kind', '=', kind)
			.where('state', '=', 'running')
			.where('lockedUntil', '>', sql<Date>`now()`)
			.executeTakeFirstOrThrow();

		const free = concurrency - Number(count);
		if (free <= 0) return [];

		const jobs = await tx
			.updateTable('jobs')
			.set(eb => ({
				state: 'running',
				lockedBy: worker,
				lockedUntil: after(leaseDuration * 1000),
				attempts: eb('attempts', '+', 1),
			}))
			.where('id', 'in', query =>
				query
					.selectFrom('jobs')
					.select('id')
					.where('kind', '=', kind)
					.where(eb =>
						eb.or([
							eb.and([eb('state', '=', 'queued'), eb('runAt', '<=', sql<Date>`now()`)]),
							eb.and([eb('state', '=', 'running'), eb('lockedUntil', '<=', sql<Date>`now()`)]),
						])
					)
					.orderBy('runAt')
					.limit(free)
					.forUpdate()
					.skipLocked()
			)
			.returningAll()
			.execute();

		return jobs as Job[];
	});
}

function execute(job: Job, definition: Definition<any>): void {
	if (stopping) return;

	const controller = new AbortController();
	running.set(job.id, controller);

	void runJob(job, definition, controller.signal)
		.catch(error => io.error(`jobs: could not finish ${job.kind} job ${job.id}:`, io.errorText(error)))
		.finally(() => {
			running.delete(job.id);
			schedulePoll();
		});
}

async function runJob(job: Job, definition: Definition<any>, signal: AbortSignal): Promise<void> {
	const owned = database.updateTable('jobs').where('id', '=', job.id).where('lockedBy', '=', worker);

	const parsed = definition.input ? definition.input.safeParse(job.input) : { success: true as const, data: job.input };
	if (!parsed.success) {
		await owned.set({ state: 'failed', lastError: z.prettifyError(parsed.error), lockedBy: null, lockedUntil: null }).execute();
		return;
	}

	const context: Context = { signal, attempt: job.attempts, key: job.key, userId: job.userId };
	const maxAttempts = definition.attempts ?? 1;

	let next: Date | void;
	try {
		if (job.attempts > maxAttempts) throw new Error('The job was abandoned by a stopped worker too many times');
		next = await definition.run(parsed.data, context);
	} catch (error) {
		if (signal.aborted && (signal.reason === cancelled || signal.reason === shutdown)) return;

		const lastError = io.errorText(error);

		if (job.attempts < maxAttempts) {
			const backoff = (definition.backoff ?? defaultBackoff) * 2 ** (job.attempts - 1);
			await owned.set({ state: 'queued', lastError, runAt: after(backoff), lockedBy: null, lockedUntil: null }).execute();
			return;
		}

		io.warn(`jobs: ${job.kind} job ${job.key ?? job.id} failed:`, lastError);

		const { numUpdatedRows } = await owned
			.set(
				definition.every
					? { state: 'queued', lastError, attempts: 0, runAt: after(definition.every), lockedBy: null, lockedUntil: null }
					: { state: 'failed', lastError, lockedBy: null, lockedUntil: null }
			)
			.executeTakeFirst();

		if (numUpdatedRows) await definition.failed?.(parsed.data, error, context);
		return;
	}

	const runAt = next instanceof Date ? next : definition.every ? after(definition.every) : undefined;

	if (!runAt) {
		await database.deleteFrom('jobs').where('id', '=', job.id).where('lockedBy', '=', worker).execute();
	} else {
		await owned.set({ state: 'queued', runAt, attempts: 0, lastError: null, lockedBy: null, lockedUntil: null }).execute();
	}

	await notify(job.kind);
}

/** Extend the leases of running jobs, aborting any that were cancelled or taken over */
async function heartbeat(): Promise<void> {
	if (!running.size) return;

	const ids = [...running.keys()];

	const renewed = await database
		.updateTable('jobs')
		.set({ lockedUntil: after(leaseDuration * 1000) })
		.where('id', 'in', ids)
		.where('lockedBy', '=', worker)
		.where('state', '=', 'running')
		.returning('id')
		.execute();

	const kept = new Set(renewed.map(row => row.id));
	for (const id of ids) if (!kept.has(id)) running.get(id)?.abort(cancelled);
}

/** Sleep until the next queued job is due or a lease held elsewhere expires */
async function scheduleWake(): Promise<void> {
	clearTimeout(wakeTimer);

	const kinds = [...definitions.keys()];

	const { delay } = kinds.length
		? await database
				.selectFrom('jobs')
				.select(
					sql<
						string | null
					>`extract(epoch from min(CASE WHEN state = 'queued' THEN "runAt" ELSE "lockedUntil" END) - now()) * 1000`.as('delay')
				)
				.where('kind', 'in', kinds)
				.where(eb =>
					eb.or([
						eb.and([eb('state', '=', 'queued'), eb('runAt', '>', sql<Date>`now()`)]),
						eb.and([eb('state', '=', 'running'), eb('lockedBy', '!=', worker), eb('lockedUntil', '>', sql<Date>`now()`)]),
					])
				)
				.executeTakeFirstOrThrow()
		: { delay: null };

	const wait = delay === null ? longestWait : Math.min(Math.max(Math.ceil(Number(delay)), 0), longestWait);
	wakeTimer = setTimeout(schedulePoll, wait).unref();
}

async function poll(): Promise<void> {
	for (const [kind, definition] of definitions) {
		if (stopping) return;
		for (const job of await claim(kind, definition)) execute(job, definition);
	}

	await scheduleWake();
}

function schedulePoll(): void {
	if (!started || stopping) return;

	if (polling) {
		pollAgain = true;
		return;
	}

	polling = poll()
		.catch(error => {
			io.error('jobs: could not check for due jobs:', io.errorText(error));
			clearTimeout(wakeTimer);
			wakeTimer = setTimeout(schedulePoll, longestWait).unref();
		})
		.finally(() => {
			polling = null;
			if (!pollAgain) return;
			pollAgain = false;
			schedulePoll();
		});
}

/** Start running jobs of the kinds defined in this process */
export async function start(): Promise<void> {
	if (started) return;
	started = true;

	for (const [kind, definition] of definitions) await ensureRecurring(kind, definition);

	try {
		await listen(channel, schedulePoll);
		await listen(cancelChannel, id => running.get(id)?.abort(cancelled));
	} catch (error) {
		io.warn('jobs: could not listen for notifications, falling back to polling:', io.errorText(error));
	}

	heartbeatTimer = setInterval(
		() => void heartbeat().catch(error => io.error('jobs: could not renew leases:', io.errorText(error))),
		heartbeatInterval
	).unref();

	schedulePoll();
	io.debug(`jobs: started ${worker}`);
}

/** Stop claiming jobs, abort running ones, and give them back to the queue */
export async function stop(): Promise<void> {
	if (!started || stopping) return;
	stopping = true;

	clearTimeout(wakeTimer);
	clearInterval(heartbeatTimer);
	await polling;

	for (const controller of running.values()) controller.abort(shutdown);

	await database
		.updateTable('jobs')
		.set(eb => ({ state: 'queued', attempts: eb('attempts', '-', 1), lockedBy: null, lockedUntil: null }))
		.where('lockedBy', '=', worker)
		.where('state', '=', 'running')
		.execute();

	await notify('stop').catch(() => {});

	started = false;
	stopping = false;
}
