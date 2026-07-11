import { getConfig } from '@axium/core/plugins';
import { config, hostname } from '@axium/server/config';
import * as io from 'ioium/node';
import { authenticate } from 'mailauth';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import PostalMime, { type Address as ParsedAddress } from 'postal-mime';
import { SMTPServer, type SMTPServerDataStream, type SMTPServerOptions, type SMTPServerSession } from 'smtp-server';
import { Mailbox } from '../common.js';
import { deliver, localUser, notifyReceived, type IncomingAttachment, type MessageData } from './send.js';

let server: SMTPServer | undefined;

/** Convert a parsed address into a valid Mailbox, since we can't trust senders to use valid addresses */
function toMailbox(parsed?: ParsedAddress | null): Mailbox | null {
	if (!parsed) return null;
	const result = Mailbox.safeParse({ name: parsed.name || null, address: 'address' in parsed ? parsed.address : null });
	if (result.success) return result.data;
	if (parsed.name) return { name: parsed.name, address: `invalid@${hostname()}` };
	return null;
}

function toMailboxes(parsed?: ParsedAddress[]): Mailbox[] {
	return (parsed ?? []).flatMap(address => {
		if ('group' in address && Array.isArray(address.group)) return address.group.map(toMailbox).filter(m => m != null);
		const mailbox = toMailbox(address);
		return mailbox ? [mailbox] : [];
	});
}

async function handleMessage(stream: SMTPServerDataStream, session: SMTPServerSession): Promise<void> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of stream) chunks.push(chunk);

	if (stream.sizeExceeded) throw Object.assign(new Error('Message exceeds maximum size'), { responseCode: 552 });

	const raw = Buffer.concat(chunks);

	// SPF/DKIM/DMARC; failures go to spam rather than being rejected, since
	// rejecting after DATA gives senders a bounce with the reason anyway
	let spam = false;
	try {
		const auth = await authenticate(raw, {
			ip: session.remoteAddress,
			helo: session.hostNameAppearsAs,
			sender: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined,
			mta: hostname(),
		});
		spam = !auth.dmarc || auth.dmarc.status.result == 'fail' || !auth.spf || auth.spf.status.result == 'fail';
	} catch (e) {
		io.warn('Could not authenticate inbound email: ' + io.errorText(e));
	}

	const parsed = await PostalMime.parse(raw);

	const envelopeFrom = session.envelope.mailFrom ? session.envelope.mailFrom.address : `unknown@${hostname()}`;

	const data: MessageData = {
		messageId: parsed.messageId || `<${randomUUID()}@${hostname()}>`,
		inReplyTo: parsed.inReplyTo?.trim() || null,
		references: parsed.references?.split(/\s+/).filter(ref => ref.length) ?? [],
		from: toMailbox(parsed.from) ?? { address: envelopeFrom },
		to: toMailboxes(parsed.to),
		cc: toMailboxes(parsed.cc),
		bcc: [],
		subject: parsed.subject ?? '',
		text: parsed.text,
		html: parsed.html,
		date: parsed.date ? new Date(parsed.date) : new Date(),
		size: raw.byteLength,
	};

	const attachments: IncomingAttachment[] = (parsed.attachments ?? []).map(attachment => ({
		filename: attachment.filename || 'attachment',
		contentType: attachment.mimeType || 'application/octet-stream',
		content: typeof attachment.content == 'string' ? new TextEncoder().encode(attachment.content) : new Uint8Array(attachment.content),
	}));

	const delivered = new Set<string>();
	for (const recipient of session.envelope.rcptTo) {
		const user = await localUser(recipient.address);
		if (!user || delivered.has(user.id)) continue;
		delivered.add(user.id);
		notifyReceived(await deliver(user.id, spam ? 'spam' : 'inbox', data, attachments));
	}
}

function tlsOptions(): SMTPServerOptions {
	const { inbound } = getConfig('@axium/email');

	const key_file = inbound.ssl_key || config.web.ssl_key;
	const cert_file = inbound.ssl_cert || config.web.ssl_cert;

	try {
		return { key: readFileSync(key_file), cert: readFileSync(cert_file) };
	} catch (e: any) {
		io.warn(`Inbound SMTP will not support STARTTLS (${e.message})`);
		return { disabledCommands: ['STARTTLS'] };
	}
}

export function startInbound(): void {
	if (server) return;

	const { inbound } = getConfig('@axium/email');

	if (!inbound.enabled) return;

	server = new SMTPServer({
		...tlsOptions(),
		name: hostname(),
		size: inbound.max_size ? inbound.max_size * 1000 : undefined,
		disableReverseLookup: true,
		authOptional: true,
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async onRcptTo(address, _session, callback) {
			const user = await localUser(address.address);
			if (!user) return callback(Object.assign(new Error('Mailbox not found'), { responseCode: 550 }));
			callback();
		},
		onData(stream, session, callback) {
			handleMessage(stream, session).then(
				() => callback(),
				(e: Error & { responseCode?: number }) => {
					io.warn('Failed to handle inbound email: ' + io.errorText(e));
					e.responseCode ??= 451;
					callback(e);
				}
			);
		},
	});

	server.on('error', e => io.warn('Inbound SMTP error: ' + io.errorText(e)));
	server.listen(inbound.port);
}

export function stopInbound(): void {
	server?.close();
	server = undefined;
}
