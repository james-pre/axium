import { Severity, type AuditEvent, type AuditFilter } from '@axium/core/audit';
import type { Insertable, SelectQueryBuilder } from 'kysely';
import { styleText } from 'node:util';
import { capitalize, omit } from 'utilium';
import * as z from 'zod';
import config from './config.js';
import { database, type Schema } from './database.js';
import * as io from './io.js';

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

function output(event: AuditEvent) {
	if (event.severity > Severity[capitalize(config.audit.min_severity)]) return;
	console.error('[audit]', styleText('dim', io.prettyDate(event.timestamp)), styleSeverity(event.severity), event.name);
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

export interface $EventTypes {
	user_created: never;
	user_deleted: never;
	new_session: { id: string };
	logout: { sessions: string[] };
	acl_id_mismatch: { item: string };
	admin_change: { user: string };
	admin_api: { route: string; session: string };
}

export type EventName = keyof $EventTypes;
export type EventExtra<T extends EventName> = $EventTypes[T];

export interface AuditEventConfigInit {
	name: EventName;
	source: string;
	severity: Severity;
	tags: string[];
	/** Schema for the extra data */
	extra?: z.core.$ZodShape;
	noAutoSuspend?: boolean;
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

const events = new Map<EventName, AuditEventConfig>();

export function addEvent(init: AuditEventConfigInit) {
	if (events.has(init.name)) throw io.error(`Can not register multiple events with the same name ("${init.name}")`);
	const config = {
		...init,
		extra: init.extra ? z.object(init.extra) : undefined,
	};
	events.set(init.name, config);
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

export function getEvents(filter: AuditFilter): SelectQueryBuilder<Schema, 'audit_log', AuditEvent> {
	let query = database.selectFrom('audit_log').selectAll();

	if ('user' in filter && !filter.user) query = query.where('userId', 'is', null);
	else if (filter.user) query = query.where('userId', '=', filter.user);
	if (filter.source) query = query.where('source', '=', filter.source);
	if (filter.event) query = query.where('name', '=', filter.event);
	if (filter.tags) query = query.where('tags', '@>', filter.tags);
	if (filter.severity) query = query.where('severity', '<=', filter.severity);
	if (filter.since) query = query.where('timestamp', '>=', filter.since);
	if (filter.until) query = query.where('timestamp', '<=', filter.until);

	return query;
}

// Register built-ins

addEvent({ source: '@axium/server', name: 'user_created', severity: Severity.Info, tags: ['user'] });
addEvent({ source: '@axium/server', name: 'user_deleted', severity: Severity.Info, tags: ['user'] });
addEvent({ source: '@axium/server', name: 'new_session', severity: Severity.Info, tags: ['user'], extra: { id: z.string() } });
addEvent({ source: '@axium/server', name: 'logout', severity: Severity.Info, tags: ['user'], extra: { sessions: z.array(z.string()) } });
addEvent({
	source: '@axium/server',
	name: 'admin_change',
	severity: Severity.Notice,
	tags: ['cli'],
	extra: { user: z.string() },
});
addEvent({
	source: '@axium/server',
	name: 'acl_id_mismatch',
	severity: Severity.Critical,
	tags: ['acl', 'auth'],
	extra: { item: z.string() },
	noAutoSuspend: true,
});
addEvent({
	source: '@axium/server',
	name: 'admin_api',
	severity: Severity.Debug,
	tags: ['auth'],
	extra: { route: z.string(), session: z.string() },
});
