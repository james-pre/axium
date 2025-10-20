import { capitalize, uncapitalize } from 'utilium/string.js';
import * as z from 'zod';
import type { User } from './user.js';

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

export interface AuditEvent<T extends Record<string, unknown> = Record<string, unknown>> {
	/** UUID of the event */
	id: string;
	/** UUID of the user that triggered the event. `null` for events triggered via the server CLI */
	userId: string | null;
	user?: (Pick<User, 'id' | 'name'> & Partial<User>) | null;
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
