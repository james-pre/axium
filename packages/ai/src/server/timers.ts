import * as jobs from '@axium/server/jobs';
import { notify } from '@axium/server/notifications';
import { error } from '@axium/server/requests';
import { io as socketServer } from '@axium/server/socket';
import * as z from 'zod';
import * as ai from '../common.js';
import type * as tools from '../tools.js';

const TimerInput = z.object({
	label: ai.TimerLabel.nullable(),
	message: ai.TimerMessage.nullable(),
	duration: z.int().positive(),
});
type TimerInput = z.infer<typeof TimerInput>;

/** The most timers a user may have running */
const maxTimers = 50;

const timers = jobs.define('ai.timer', {
	input: TimerInput,
	async run({ label, message }, { key: id, userId }) {
		if (!id || !userId) return;

		socketServer?.to('user:' + userId).emit('ai.timer.remove', { id, done: true });
		await notify(userId, { title: label ?? 'Timer', body: message ?? "Time's up", url: '/ai', tag: 'ai.timer:' + id });
	},
});

function toTimer(job: jobs.Job<TimerInput>): ai.Timer {
	return { id: job.key!, ...job.input, created: job.createdAt, ends: job.runAt };
}

export async function list(userId: string): Promise<ai.Timer[]> {
	const pending = await timers.list({ userId });
	return pending.filter(job => job.state != 'failed').map(toTimer);
}

export async function start(userId: string, init: ai.TimerInit): Promise<ai.Timer> {
	if ((await list(userId)).length >= maxTimers) error(409, `There are already ${maxTimers} timers running; cancel one first`);

	const id = crypto.randomUUID();
	const input = { label: init.label ?? null, message: init.message ?? null, duration: init.duration };
	await timers.enqueue(input, { key: id, userId, at: new Date(Date.now() + init.duration * 1000) });

	const job = await timers.get(id);
	if (!job) error(500, 'Could not start the timer');

	const timer = toTimer(job);
	socketServer?.to('user:' + userId).emit('ai.timer', timer);
	return timer;
}

export async function cancel(userId: string, id: string): Promise<ai.Timer> {
	const job = await timers.get(id);
	if (!job || job.userId != userId) error(404, 'No timer has the ID ' + id);

	await timers.cancel(id);
	socketServer?.to('user:' + userId).emit('ai.timer.remove', { id, done: false });
	return toTimer(job);
}

/** Timers for tools run by the server's loop */
export function forUser(userId: string): tools.Timers {
	return {
		start: init => start(userId, init),
		list: () => list(userId),
		cancel: id => cancel(userId, id),
	};
}
