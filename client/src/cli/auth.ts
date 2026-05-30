import { NewSessionResponse } from '@axium/core';
import * as io from 'ioium/node';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import { config, resolveServerURL } from '../config.js';
import { prefix, setPrefix, setToken } from '../requests.js';
import { getCurrentSession } from '../user.js';
import * as cache from './cache.js';
import { saveConfig } from './config.js';
import * as os from 'node:os';
import $pkg from '../../package.json' with { type: 'json' };

export const clientUA = `Axium Client/${$pkg.version} (${os.type()}; ${process.arch})`;

export async function login(url?: string) {
	using rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.on('SIGINT', () => io.exit('Aborted.', 7));

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
			res.writeHead(200).end();
			sessionReady.resolve(NewSessionResponse.parse(JSON.parse(body)));
		} catch (e: any) {
			res.statusCode = 500;
			res.end('Internal server error: ' + io.errorText(e));
			sessionReady.reject(io.errorText(e));
		}
	});

	const serverReady = Promise.withResolvers<number>();

	server.listen(() => {
		const { port } = server.address() as AddressInfo;
		serverReady.resolve(port);
	});

	server.on('error', e => io.exit('Failed to start local callback server: ' + io.errorText(e), 5));

	const port = await serverReady.promise;

	const authURL = new URL(`/login/client?port=${port}&client=${encodeURIComponent(clientUA)}`, url).href;
	console.log('Authenticate by visiting this URL in your browser: ' + styleText('underline', authURL));

	const { token } = await sessionReady.promise.catch(e => io.exit('Failed to obtain session: ' + e, 6));
	setToken(token);

	server.close();

	const session = await io.track(
		'Verifying session',
		getCurrentSession().catch(e => io.exit(e, 6))
	);

	io.debug('Session UUID: ' + session.id);

	console.log(`Welcome ${session.user.name}! Your session is valid until ${session.expires.toLocaleDateString()}.`);

	config.token = token;
	config.server = url;
	saveConfig();
	await cache.update(true);
}
