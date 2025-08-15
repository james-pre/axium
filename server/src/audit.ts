import type { Insertable } from 'kysely';
import { styleText } from 'node:util';
import { capitalize, omit } from 'utilium';
import type z from 'zod';
import config from './config.js';
import { database, type Schema } from './database.js';
import * as io from './io.js';

export enum Severity {
	Emergency,
	Alert,
	Critical,
	Error,
	Warning,
	Notice,
	Info,
	Debug,
}

const severityFormat = {
	[Severity.Emergency]: ['bgRedBright', 'white', 'underline'],
	[Severity.Alert]: ['bgRedBright', 'white'],
	[Severity.Critical]: ['bold', 'redBright'],
	[Severity.Error]: 'redBright',
	[Severity.Warning]: 'yellowBright',
	[Severity.Notice]: 'cyanBright',
	[Severity.Info]: [],
	[Severity.Debug]: ['dim'],
} satisfies Record<Severity, Parameters<typeof styleText>[0]>;

export function styleSeverity(sev: Severity, align: boolean = false) {
	const text = align ? Severity[sev].padEnd(9) : Severity[sev];
	return styleText(severityFormat[sev], text.toUpperCase());
}

export interface AuditEvent<T extends Record<string, unknown> = Record<string, unknown>> {
	/** UUID of the event */
	id: string;
	/** UUID of the user that triggered the event. `null` for events triggered via the server CLI */
	userID?: string | null;
	/** When the event happened */
	timestamp: Date;
	/** How severe the event is */
	severity: Severity;
	/** Snake case name for the event */
	name: string;
	/** The source of the event. This should be a package name */
	source: string;
	/** Tags for the event. For example, `auth` for authentication events */
	tags: string[];
	/** Additional event specific data. */
	extra: T;
}

function output(event: AuditEvent) {
	if (event.severity > Severity[capitalize(config.audit.min_severity)]) return;
	console.error(`[audit] ${styleSeverity(event.severity)} ${event.name}`);
}

export interface AuditEventInit extends Insertable<Schema['audit_log']> {}

export async function audit_raw(event: AuditEventInit): Promise<void> {
	if (!config.audit.allow_raw) {
		io.warn('[audit] Ignoring raw event (disabled)');
		return;
	}

	const result = await database.insertInto('audit_log').values(event).returningAll().executeTakeFirstOrThrow();
	output(result);
}

export interface AuditEventConfig {
	name: EventName;
	source: string;
	severity: Severity;
	tags: string[];
	/** Schema for the extra data */
	extra?: z.ZodObject;
	noAutoSuspend?: boolean;
}

export interface $EventTypes {
	user_created: never;
	user_deleted: never;
}

export type EventName = keyof $EventTypes;
export type EventExtra<T extends EventName> = $EventTypes[T];

const events = new Map<EventName, AuditEventConfig>();

export function addEvent(config: AuditEventConfig) {
	if (events.has(config.name)) throw io.error(`Can not register multiple events with the same name ("${config.name}")`);
	events.set(config.name, config);
}

export async function audit<T extends EventName>(eventName: T, userId?: string, extra?: EventExtra<T>) {
	const cfg = events.get(eventName);

	if (!cfg) {
		io.warn('Ignoring audit event with unknown event name: ' + eventName);
		return;
	}

	try {
		if (cfg.extra) extra = cfg.extra.parse(extra) as EventExtra<T>;
	} catch (e) {
		io.error('Audit event has invalid extra data: ' + eventName);
		return;
	}

	const event = await database
		.insertInto('audit_log')
		.values({ ...omit(cfg, 'extra'), extra, userId })
		.returningAll()
		.executeTakeFirstOrThrow();
	output(event);

	if (userId && !cfg.noAutoSuspend && event.severity < Severity[capitalize(config.audit.auto_suspend)]) {
		await database
			.updateTable('users')
			.set({ isSuspended: true })
			.where('id', '=', userId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.then(user => console.error('[audit] Auto-suspended user:', user.id, `<${user.email}>`))
			.catch(() => null);
	}
}

export interface AuditFilter {
	since?: Date;
	until?: Date;
	user?: string;
	severity?: Severity;
	source?: string;
	tags?: string[];
	event?: string;
	cli?: boolean;
}

export async function getEvents(filter: AuditFilter): Promise<AuditEvent[]> {
	let query = database.selectFrom('audit_log').selectAll();

	if (filter.cli) query = query.where('userId', 'is', null);
	else if (filter.user) query = query.where('userId', '=', filter.user);
	if (filter.source) query = query.where('source', '=', filter.source);
	if (filter.event) query = query.where('name', '=', filter.event);
	if (filter.tags) query = query.where('tags', '@>', filter.tags);
	if (filter.severity) query = query.where('severity', '<=', filter.severity);
	if (filter.since) query = query.where('timestamp', '>=', filter.since);
	if (filter.until) query = query.where('timestamp', '<=', filter.until);

	return await query.execute();
}

// Register built-ins

addEvent({ source: '@axium/server', name: 'user_created', severity: Severity.Info, tags: ['user'] });
addEvent({ source: '@axium/server', name: 'user_deleted', severity: Severity.Info, tags: ['user'] });
