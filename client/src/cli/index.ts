#! /usr/bin/env node

import type { NewSessionResponse } from '@axium/core';
import * as io from '@axium/core/node/io';
import { program, type Command } from 'commander';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import $pkg from '../../package.json' with { type: 'json' };
import { prefix, setPrefix, setToken } from '../requests.js';
import { getCurrentSession, logout } from '../user.js';
import { config, loadConfig, resolveServerURL, saveConfig, updateCache } from './config.js';

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
	.option('--refresh', 'Force a refresh of session and user metadata from server')
	.option('--cache-only', 'Run entirely from local cache, even if it is expired.');

program.on('option:debug', () => io._setDebugOutput(true));

program.hook('preAction', async (_, action: Command) => {
	loadConfig();
	if (!config.token) return;
	const opt = action.optsWithGlobals<{ refresh: boolean; cacheOnly: boolean }>();
	if (!opt.cacheOnly) await updateCache(opt.refresh);
});

program
	.command('login')
	.description('Log in to your account on an Axium server')
	.argument('[server]', 'Axium server URL')
	.action(async (url?: string) => {
		if (prefix[0] != '/') url ||= prefix;
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

		const { token } = await sessionReady.promise.catch(e => io.exit('Failed to obtain session: ' + e, 6));
		setToken(token);

		server.close();

		io.start('Verifying session');
		const session = await getCurrentSession().catch(e => io.exit(e.message, 6));
		io.done();

		io.debug('Session UUID: ' + session.id);

		console.log(`Welcome ${session.user.name}! Your session is valid until ${session.expires.toLocaleDateString()}.`);

		saveConfig({ token, server: url });
		await updateCache(true);
	});

program.command('logout').action(async () => {
	if (!config.token) io.exit('Not logged in.', 4);
	if (!config.cache) io.exit('No session data available.', 3);

	await logout(config.cache.session.userId, config.cache.session.id);
});

program.command('status').action(() => {
	if (!config.token) return console.log('Not logged in.');
	if (!config.cache) return console.log('No session data available.');

	console.log('Logged in to', new URL(prefix).host);
	console.log(styleText('whiteBright', 'Session ID:'), config.cache.session.id);
	const { user } = config.cache.session;
	console.log(styleText('whiteBright', 'User:'), user.name, `<${user.email}>`, styleText('dim', `(${user.id})`));
});

await program.parseAsync();
