import type { User } from '@axium/core';
import { hostname } from '@axium/server/config';
import { database } from '@axium/server/database';
import { sendMail } from '@axium/server/email';
import { error, withError } from '@axium/server/requests';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium/node';
import { pick } from 'utilium';
import type { Email, EmailFolder, EmailInit, Mailbox } from '../common.js';
import { splitQuoted } from '../common.js';
import './db.js';

/** The address of a user on this server */
export function addressFor(user: Pick<User, 'username'>): string | null {
	return user.username ? `${user.username}@${hostname()}` : null;
}

/** Make a list snippet from a body, excluding quoted replies */
export function makeSnippet(text?: string | null): string | null {
	if (!text) return null;
	return splitQuoted(text).content.replaceAll(/\s+/g, ' ').trim().slice(0, 160) || null;
}

/** Resolve the user an address belongs to, if it is local to this server */
export async function localUser(address: string): Promise<{ id: string } | null> {
	const [local, domain] = address.toLowerCase().split('@');
	if (domain != hostname()) return null;
	const user = await database.selectFrom('users').select('id').where('username', '=', local).executeTakeFirst();
	return user ?? null;
}

/** Find the thread a reply belongs to in a user's mailbox */
export async function threadFor(userId: string, inReplyTo?: string | null): Promise<string> {
	if (inReplyTo) {
		const ref = await database
			.selectFrom('emails')
			.select('threadId')
			.where('userId', '=', userId)
			.where('messageId', '=', inReplyTo)
			.orderBy('received', 'desc')
			.executeTakeFirst();
		if (ref) return ref.threadId;
	}
	return crypto.randomUUID();
}

export interface MessageData {
	messageId: string;
	inReplyTo?: string | null;
	references?: string[];
	from: Mailbox;
	to: Mailbox[];
	cc: Mailbox[];
	bcc: Mailbox[];
	subject: string;
	text?: string | null;
	html?: string | null;
	date: Date;
	size: number;
}

export interface IncomingAttachment {
	filename: string;
	contentType: string;
	content: Uint8Array<ArrayBuffer>;
}

/** Store a message in a user's mailbox */
export async function deliver(
	userId: string,
	folder: EmailFolder,
	data: MessageData,
	attachments: IncomingAttachment[] = []
): Promise<Email> {
	const row = await database
		.insertInto('emails')
		.values({
			userId,
			folder,
			...data,
			threadId: await threadFor(userId, data.inReplyTo),
			snippet: makeSnippet(data.text),
			read: folder == 'sent' || folder == 'drafts',
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	const stored = { ...row, attachments: [] as Email['attachments'] };

	for (const attachment of attachments) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { content: _, ...meta } = await database
			.insertInto('email_attachments')
			.values({
				emailId: row.id,
				filename: attachment.filename,
				contentType: attachment.contentType,
				size: BigInt(attachment.content.byteLength),
				content: attachment.content,
			})
			.returningAll()
			.executeTakeFirstOrThrow();
		stored.attachments.push(meta);
	}

	return stored;
}

/**
 * Send a message composed by a local user: store the sender's copy,
 * deliver to local recipients, and queue delivery to external recipients.
 */
export async function send(sender: User, init: EmailInit): Promise<Email> {
	const address = addressFor(sender);
	if (!address) error(409, 'You need a username to use email');

	const data: MessageData = {
		messageId: `<${crypto.randomUUID()}@${hostname()}>`,
		...pick(init, 'inReplyTo', 'to', 'cc', 'bcc', 'subject', 'text'),
		references: [],
		from: { name: sender.name, address },
		date: new Date(),
		size: new TextEncoder().encode(init.text ?? '').byteLength,
	};

	if (init.inReplyTo) {
		const ref = await database
			.selectFrom('emails')
			.select('references')
			.where('userId', '=', sender.id)
			.where('messageId', '=', init.inReplyTo)
			.executeTakeFirst();
		data.references = [...(ref?.references ?? []), init.inReplyTo];
	}

	if (init.draftId) {
		await database
			.deleteFrom('emails')
			.where('id', '=', init.draftId)
			.where('userId', '=', sender.id)
			.where('folder', '=', 'drafts')
			.execute()
			.catch(withError('Could not consume draft'));
	}

	if (init.isDraft) return await deliver(sender.id, 'drafts', data);

	const sent = await deliver(sender.id, 'sent', data);

	const delivered = new Set<string>();
	const external = new Set<string>();

	for (const recipient of [...init.to, ...init.cc, ...init.bcc]) {
		const local = await localUser(recipient.address);
		if (!local) {
			external.add(recipient.address.toLowerCase());
			continue;
		}
		if (delivered.has(local.id)) continue;
		delivered.add(local.id);
		// recipients must not see who was bcc'd
		notifyReceived(await deliver(local.id, 'inbox', { ...data, bcc: [] }));
	}

	for (const recipient of external) {
		await database.insertInto('email_outbound').values({ emailId: sent.id, recipient }).execute();
	}

	if (external.size) void processOutbound().catch(e => io.warn('Outbound delivery failed: ' + io.errorText(e)));

	return sent;
}

/** Push a message to its mailbox owner over the socket */
export function notifyReceived(email: Email): void {
	socketServer?.to(`user:${email.userId}`).emit('email.received', email);
}

const maxAttempts = 8;

let outboundWorker: NodeJS.Timeout | undefined;
let processing = false;

/** Periodically deliver queued outbound messages */
export function startOutbound(): void {
	outboundWorker ??= setInterval(
		() => void processOutbound().catch(e => io.warn('Outbound delivery failed: ' + io.errorText(e))),
		60_000
	);
	outboundWorker.unref();
}

export function stopOutbound(): void {
	clearInterval(outboundWorker);
	outboundWorker = undefined;
}

/** Attempt delivery of a single queued message */
async function attemptDelivery(job: { id: string; recipient: string; attempts: number }, email: Email): Promise<void> {
	try {
		await sendMail(job.recipient, {
			...pick(email, 'subject', 'date', 'read', 'messageId'),
			envelope: { from: email.from.address, to: [job.recipient] },
			from: { name: email.from.name ?? '', address: email.from.address },
			to: email.to.map(m => ({ name: m.name ?? '', address: m.address })),
			cc: email.cc.map(m => ({ name: m.name ?? '', address: m.address })),
			text: email.text ?? undefined,
			html: email.html ?? undefined,
			inReplyTo: email.inReplyTo ?? undefined,
		});
		await database.updateTable('email_outbound').set({ status: 'sent' }).where('id', '=', job.id).execute();
	} catch (e: any) {
		const attempts = job.attempts + 1;
		const failed = attempts >= maxAttempts;
		await database
			.updateTable('email_outbound')
			.set({
				attempts,
				status: failed ? 'failed' : 'pending',
				lastError: String(e?.message ?? e),
				nextAttempt: new Date(Date.now() + 5 * 2 ** attempts * 60_000),
			})
			.where('id', '=', job.id)
			.execute();
		if (failed) await bounce(email, job.recipient, String(e?.message ?? e));
	}
}

/** Deliver a failure notice to the sender */
async function bounce(email: Email, recipient: string, reason: string): Promise<void> {
	notifyReceived(
		await deliver(email.userId, 'inbox', {
			messageId: `<${crypto.randomUUID()}@${hostname()}>`,
			inReplyTo: email.messageId,
			references: [email.messageId],
			from: { name: 'Mail Delivery', address: `mailing@${hostname()}` },
			to: [email.from],
			cc: [],
			bcc: [],
			subject: 'Delivery Failed',
			text: `Your message to ${recipient} could not be delivered:\n\n${reason}`,
			date: new Date(),
			size: 0,
		})
	);
}

export async function processOutbound(): Promise<void> {
	if (processing) return;
	processing = true;

	try {
		const jobs = await database
			.selectFrom('email_outbound')
			.selectAll()
			.where('status', '=', 'pending')
			.where('nextAttempt', '<=', new Date())
			.limit(20)
			.execute();

		for (const job of jobs) {
			const email = await database.selectFrom('emails').selectAll().where('id', '=', job.emailId).executeTakeFirst();
			if (!email) {
				await database.deleteFrom('email_outbound').where('id', '=', job.id).execute();
				continue;
			}
			await attemptDelivery(job, { ...email, attachments: [] });
		}
	} finally {
		processing = false;
	}
}
