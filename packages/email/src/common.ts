import { serverConfigs } from '@axium/core';
import { $API } from '@axium/core/api';
import type {} from '@axium/core/plugins';
import { addServerToClient } from '@axium/core/socket';
import * as z from 'zod';

/** A single address in a message header, e.g. `"James" <james@example.com>` */
export const Mailbox = z.object({
	name: z.string().max(255).nullish(),
	address: z.email().max(255),
});
export interface Mailbox extends z.infer<typeof Mailbox> {}

export const emailFolders = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'] as const;

export const EmailFolder = z.literal(emailFolders);
export type EmailFolder = z.infer<typeof EmailFolder>;

export const Attachment = z.object({
	id: z.uuid(),
	emailId: z.uuid(),
	filename: z.string().max(255),
	contentType: z.string().max(255),
	size: z.coerce.bigint().nonnegative(),
});
export interface Attachment extends z.infer<typeof Attachment> {}

/** The body of a message being composed (sent or saved as a draft) */
export const EmailInit = z.object({
	to: Mailbox.array().max(100).default([]),
	cc: Mailbox.array().max(100).default([]),
	bcc: Mailbox.array().max(100).default([]),
	subject: z.string().max(998).default(''),
	text: z.string().max(1_000_000).nullish(),
	inReplyTo: z.string().max(998).nullish(),
	/** Save as a draft instead of sending */
	isDraft: z.boolean().default(false),
	/** When sending a previously saved draft, its ID */
	draftId: z.uuid().nullish(),
});
export interface EmailInit extends z.infer<typeof EmailInit> {}

export const Email = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	messageId: z.string().max(998),
	inReplyTo: z.string().max(998).nullish(),
	references: z.string().array(),
	threadId: z.uuid(),
	from: Mailbox,
	to: Mailbox.array(),
	cc: Mailbox.array(),
	bcc: Mailbox.array(),
	subject: z.string(),
	snippet: z.string().nullish(),
	text: z.string().nullish(),
	html: z.string().nullish(),
	/** From the Date header */
	date: z.coerce.date(),
	/** When the message was stored */
	received: z.coerce.date(),
	folder: EmailFolder,
	read: z.boolean(),
	starred: z.boolean(),
	labels: z.string().array(),
	/** Size of the raw message in bytes */
	size: z.int().nonnegative(),
	attachments: Attachment.array(),
});
export interface Email extends z.infer<typeof Email> {}

/** Flag and draft changes */
export const EmailChangeable = z
	.object({
		folder: EmailFolder,
		read: z.boolean(),
		starred: z.boolean(),
		labels: z.string().max(100).array().max(100),
		// these can only be changed on drafts
		to: Mailbox.array().max(100),
		cc: Mailbox.array().max(100),
		bcc: Mailbox.array().max(100),
		subject: z.string().max(998),
		text: z.string().max(1_000_000).nullable(),
	})
	.partial();
export interface EmailChangeable extends z.infer<typeof EmailChangeable> {}

export const EmailListQuery = z.object({
	folder: EmailFolder.optional(),
	starred: z.boolean().optional(),
	limit: z.int().min(1).max(200).default(50),
	offset: z.int().nonnegative().default(0),
});
export interface EmailListQuery extends z.infer<typeof EmailListQuery> {}

export const EmailConfig = z.object({
	inbound: z.object({
		enabled: z.boolean(),
		port: z.int().min(1).max(65535),
		/** Max inbound message size in KB */
		max_size: z.number().min(0),
		/** Override the web SSL certificate for STARTTLS */
		ssl_key: z.string().optional(),
		ssl_cert: z.string().optional(),
	}),
});
export interface EmailConfig extends z.infer<typeof EmailConfig> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/email': EmailConfig;
	}
}

serverConfigs.set('@axium/email', EmailConfig);

/**
 * Split a plain text body into new content and the quoted ("nested") part of top-posted replies.
 * Note this only handles plain text; quotes in HTML bodies are not detected.
 */
export function splitQuoted(text: string): { content: string; quoted: string | null } {
	const lines = text.split('\n');

	let start = lines.findIndex(line => /^\s*>/.test(line) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line));
	if (start == -1) return { content: text, quoted: null };

	// include the attribution line (e.g. "On <date>, <name> wrote:") and blank lines directly above
	let above = start - 1;
	while (above >= 0 && !lines[above].trim()) above--;
	if (above >= 0 && /wrote:\s*$/.test(lines[above])) start = above;

	const content = lines.slice(0, start).join('\n').trimEnd();
	if (!content.trim()) return { content: text, quoted: null };

	return { content, quoted: lines.slice(start).join('\n') };
}

declare module '@axium/core/socket' {
	export interface ServerToClient {
		'email.received': z.ZodFunction<z.ZodTuple<[typeof Email]>, z.ZodVoid>;
	}
}

addServerToClient({ 'email.received': [Email] });

const EmailAPI = {
	'users/:id/email': {
		GET: [EmailListQuery, Email.array()],
		PUT: [EmailInit, Email],
	},
	'email/:id': {
		GET: Email,
		PATCH: [EmailChangeable, Email],
		DELETE: Email,
	},
	'email/:id/thread': {
		GET: Email.array(),
	},
} as const;

type EmailAPI = typeof EmailAPI;

declare module '@axium/core/api' {
	export interface $API extends EmailAPI {}
}

Object.assign($API, EmailAPI);
