import { _findPlugin, getConfig } from '@axium/core/plugins';
import { config } from '@axium/server/config';
import { database } from '@axium/server/database';
import { dirs } from '@axium/server/io';
import { program } from 'commander';
import * as io from 'ioium/node';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { styleText } from 'node:util';
import type { EmailConfig } from '../common.js';
import { mailDomain } from './send.js';

const cli = program.command('email').helpGroup('Plugins:').description('CLI integration for @axium/email');

/** The DKIM TXT record for a private key */
function dkimRecord(privatePEM: string): string {
	const publicKey = createPublicKey(createPrivateKey(privatePEM)).export({ type: 'spki', format: 'der' }).toString('base64');
	const { selector } = getConfig('@axium/email').outbound.dkim;
	return `${selector}._domainkey.${mailDomain()}.\tIN\tTXT\t"v=DKIM1; k=rsa; p=${publicKey}"`;
}

cli.command('dns')
	.description('Print the DNS records needed to send and receive email')
	.action(() => {
		const domain = mailDomain();
		const host = new URL(config.origin).hostname;
		const { dkim } = getConfig('@axium/email').outbound;

		console.log(styleText('whiteBright', '; Receiving (MX)'));
		console.log(`${domain}.\tIN\tMX\t10 ${host}.`);

		console.log(styleText('whiteBright', '\n; Sending (SPF)'));
		console.log(`${domain}.\tIN\tTXT\t"v=spf1 mx -all"`);

		console.log(styleText('whiteBright', '\n; DKIM'));
		if (dkim.key_file && existsSync(dkim.key_file)) {
			try {
				console.log(dkimRecord(readFileSync(dkim.key_file, 'utf8')));
			} catch (e) {
				io.warn('Could not read the DKIM key: ' + io.errorText(e));
			}
		} else {
			console.log(styleText('dim', '; Generate a DKIM key with `axium email dkim-keygen` first'));
		}

		console.log(styleText('whiteBright', '\n; DMARC'));
		console.log(`_dmarc.${domain}.\tIN\tTXT\t"v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}"`);
	});

cli.command('dkim-keygen')
	.description('Generate a DKIM signing key')
	.option('-o, --out <path>', 'Where to write the private key (defaults to outbound.dkim.key_file)')
	.option('-f, --force', 'Overwrite an existing key', false)
	.action((opt: { out?: string; force: boolean }) => {
		const plugin = _findPlugin('@axium/email');
		plugin.config ||= { outbound: {} };

		const { dkim } = (plugin.config as EmailConfig).outbound;

		if (!opt.out && !dkim.key_file && plugin._configPath) {
			io.log('Setting default DKIM key file path');
			dkim.key_file = resolve(dirs[0], 'dkim_key.pem');
			mkdirSync(dirname(plugin._configPath), { recursive: true });
			io.writeJSON(plugin._configPath, plugin.config);
		}
		const path = opt.out || dkim.key_file;
		if (existsSync(path) && !opt.force) io.exit(`${path} already exists. Use --force to overwrite it.`);

		const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
		writeFileSync(path, pem, { mode: 0o600 });
		io.log('Wrote private key to ' + path);

		console.log('\nAdd this DNS record:\n');
		console.log(dkimRecord(pem));
	});

cli.command('queue')
	.description('Show the outbound email queue')
	.option('-a, --all', 'Include delivered and failed messages', false)
	.option('--retry', 'Retry failed messages now', false)
	.action(async (opt: { all: boolean; retry: boolean }) => {
		if (opt.retry) {
			const retried = await database
				.updateTable('email_outbound')
				.set({ status: 'pending', attempts: 0, nextAttempt: new Date() })
				.where('status', '=', 'failed')
				.returningAll()
				.execute();
			io.info(`Marked ${retried.length} messages for retry. They will be sent when the server processes the queue.`);
			return;
		}

		const jobs = await database
			.selectFrom('email_outbound')
			.innerJoin('emails', 'emails.id', 'email_outbound.emailId')
			.select(['email_outbound.id', 'recipient', 'status', 'attempts', 'nextAttempt', 'lastError', 'emails.subject'])
			.$if(!opt.all, qb => qb.where('status', '=', 'pending'))
			.orderBy('nextAttempt', 'asc')
			.execute();

		if (!jobs.length) {
			console.log(styleText(['italic', 'dim'], 'The queue is empty.'));
			return;
		}

		for (const job of jobs) {
			const color = job.status == 'sent' ? 'green' : job.status == 'failed' ? 'red' : 'yellow';
			console.log(
				styleText(color, job.status.padEnd(7)),
				job.recipient,
				styleText('dim', `(${job.attempts} attempts, next ${job.nextAttempt.toISOString()})`),
				styleText('yellow', JSON.stringify(job.subject)),
				job.lastError ? styleText('red', job.lastError) : ''
			);
		}
	});
