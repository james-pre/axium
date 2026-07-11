import { config, hostname } from '@axium/server/config';
import * as io from 'ioium/node';
import { readFileSync } from 'node:fs';
import { createTransport, type Transporter, type SendMailOptions } from 'nodemailer';
import { pick } from 'utilium';
import * as z from 'zod';
import * as cfg from './config_types.js';
import { resolveMx } from 'node:dns/promises';

export const MxConfig = z.object({
	host: z.string(),
	port: cfg.port,
	auth: z
		.object({
			user: z.string(),
			pass: z.string(),
		})
		.optional(),
	secure: cfg.bool,
});
export interface MxConfig extends z.infer<typeof MxConfig> {}

function transporterFor(exchange: MxConfig): Transporter {
	const { key_file, selector: keySelector } = config.email.dkim;

	let dkimOptions;
	if (key_file) {
		try {
			dkimOptions = { domainName: hostname(), keySelector, privateKey: readFileSync(key_file, 'utf8') };
		} catch (e: any) {
			io.warn(`Could not read DKIM key: ${e.message}`);
		}
	}

	return createTransport({
		...pick(exchange, 'host', 'port', 'secure', 'auth'),
		name: hostname(),
		dkim: dkimOptions,
	});
}

export async function sendMail(to: string, email: SendMailOptions) {
	const { relay } = config.email;

	let transports: Transporter[];
	if (relay.host) transports = [transporterFor(relay)];
	else {
		const domain = to.split('@').at(-1)!;
		const mx = await resolveMx(domain);
		if (!mx.length) throw new Error(`No MX records for ${domain}`);
		transports = mx
			.sort((a, b) => a.priority - b.priority)
			.slice(0, 3)
			.map(({ exchange: host }) => transporterFor({ host, port: 25, secure: false }));
	}

	let lastError: unknown;
	for (const transport of transports) {
		try {
			await transport.sendMail(email);
			return;
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError;
}
