#! /usr/bin/env node

import type { NewSessionResponse } from '@axium/core';
import * as io from '@axium/core/node/io';
import { program, type Command } from 'commander';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import $pkg from '../../package.json' with { type: 'json' };
import { setPrefix, setToken } from '../requests.js';
import { getCurrentSession, logout } from '../user.js';
import { _dayMs, loadSession, resolveServerURL, saveSession, session } from './config.js';
import { pick } from 'utilium';

using rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

rl.on('SIGINT', () => io.exit('Aborted.', 7));

program
	.version($pkg.version)
	.name('axium-client')
	.alias('axc')
	.description('Axium client CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('--refresh', 'Force a refresh of session and user metadata from server');

program.on('option:debug', () => io._setDebugOutput(true));

program.hook('preAction', async (_, action: Command) => {
	loadSession();
	if (!session) return;
	const opt = action.optsWithGlobals<{ refresh: boolean }>();
	if (opt.refresh || session._fetched + _dayMs < Date.now()) {
		io.start('Fetching session metadata');
		try {
			const data = await getCurrentSession();
			Object.assign(session, {
				...pick(data, 'user', 'userId'),
				sessionId: data.id,
				_fetched: Date.now(),
			});
			saveSession(session);
			io.done();
		} catch {
			io.warn('Failed to refresh session metadata');
			return;
		}
	}
});

program
	.command('login')
	.description('Log in to your account on an Axium server')
	.argument('[server]', 'Axium server URL')
	.action(async (url: string) => {
		url ||= await rl.question('Axium server URL: ');
		url = resolveServerURL(url);
		setPrefix(url);

		const sessionReady = Promise.withResolvers<NewSessionResponse>();

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		const server = createServer(async (req, res) => {
			res.setHeader('access-control-allow-origin', '*');
			res.setHeader('access-control-allow-methods', '*');
			res.setHeader('access-control-allow-headers', '*');

			if (req.method == 'HEAD' || req.method == 'OPTIONS') {
				res.writeHead(200).end();
				return;
			}

			if (!req.headers['content-type']?.endsWith('/json')) {
				res.writeHead(415).end('Unexpected content type');
				return;
			}

			if (req.method !== 'POST') {
				res.writeHead(405).end('Unexpected request method');
				return;
			}

			const { promise: bodyReady, resolve, reject } = Promise.withResolvers<void>();

			let body = '';

			req.on('data', chunk => (body += chunk.toString()));
			req.on('end', resolve);
			req.on('error', reject);

			try {
				await bodyReady;
				sessionReady.resolve(JSON.parse(body) as NewSessionResponse);
				res.writeHead(200).end();
			} catch (e: any) {
				res.statusCode = 500;
				res.end('Internal server error: ' + e.message);
				sessionReady.reject(e.message);
			}
		});

		const serverReady = Promise.withResolvers<number>();

		server.listen(() => {
			const { port } = server.address() as AddressInfo;
			serverReady.resolve(port);
		});

		server.on('error', e => io.exit('Failed to start local callback server: ' + e.message, 5));

		const port = await serverReady.promise;

		const authURL = new URL('/login/client?port=' + port, url).href;
		console.log('Authenticate by visiting this URL in your browser: ' + styleText('underline', authURL));

		const { token, userId } = await sessionReady.promise.catch(e => io.exit('Failed to obtain session: ' + e, 4));
		setToken(token);

		server.close();

		io.start('Verifying session');
		const { id: sessionId, expires, user } = await getCurrentSession().catch(e => io.exit(e.message, 6));
		io.done();

		io.debug('Session UUID: ' + sessionId);

		console.log(`Welcome ${user.name}! Your session is valid until ${expires.toLocaleDateString()}.`);

		saveSession({ token, server: url, userId, sessionId, user, _fetched: Date.now() });
	});

program.command('logout').action(async () => {
	if (!session) return io.exit('Not logged in.', 3);

	await logout(session.userId, session.sessionId);
});

program.command('status').action(() => {
	if (!session) {
		console.log('Not logged in.');
		return;
	}

	console.log('Logged in to', new URL(session.server).host);
	console.log(styleText('whiteBright', 'Session ID:'), session.sessionId);
	if (!session.user) io.warn('User data unavailable.');
	else
		console.log(
			styleText('whiteBright', 'User:'),
			session.user.name,
			`<${session.user.email}>`,
			styleText('dim', `(${session.user.id})`)
		);
});

await program.parseAsync();
