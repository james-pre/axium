import * as z from 'zod';

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

export interface AuditEvent<T extends Record<string, unknown> = Record<string, unknown>> {
	/** UUID of the event */
	id: string;
	/** UUID of the user that triggered the event. `null` for events triggered via the server CLI */
	userId?: string | null;
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
	user: z.string().nullish(),
	severity: z.enum(Severity).optional(),
	source: z.string().optional(),
	tags: z.string().array().optional(),
	event: z.string().optional(),
});

export interface AuditFilter extends z.infer<typeof AuditFilter> {}
