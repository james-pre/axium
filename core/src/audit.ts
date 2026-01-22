import { capitalize, uncapitalize } from 'utilium/string.js';
import * as z from 'zod';
import { User } from './user.js';

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

export const severityNames = Object.keys(Severity)
	.filter(k => isNaN(Number(k)))
	.map(uncapitalize) as Lowercase<keyof typeof Severity>[];

export const AuditEvent = z.object({
	/** UUID of the event */
	id: z.uuid(),
	/** UUID of the user that triggered the event. `null` for events triggered via the server CLI */
	userId: z.uuid().nullable(),
	user: User.partial().required({ id: true, name: true }).nullish(),
	/** When the event happened */
	timestamp: z.coerce.date(),
	/** How severe the event is */
	severity: z.enum(Severity),
	/** Snake case name for the event */
	name: z.string(),
	/** The source of the event. This should be a package name */
	source: z.string(),
	/** Tags for the event. For example, `auth` for authentication events */
	tags: z.string().array(),
	/** Additional event specific data. */
	extra: z.record(z.any(), z.unknown()),
});

export interface AuditEvent<T extends Record<string, unknown> = Record<string, unknown>> extends z.infer<typeof AuditEvent> {
	extra: T;
}

export const AuditFilter = z.object({
	since: z.coerce.date().optional(),
	until: z.coerce.date().optional(),
	user: z.union([z.uuid(), z.literal(['null']).transform(() => null)]).nullish(),
	severity: z
		.literal(severityNames)
		.transform(v => Severity[capitalize(v)])
		.optional(),
	source: z.string().optional(),
	tags: z.string().array().optional(),
	event: z.string().optional(),
});

export interface AuditFilter extends z.infer<typeof AuditFilter> {}
