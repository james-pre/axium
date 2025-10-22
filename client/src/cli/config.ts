import { App, Session, User } from '@axium/core';
import * as io from '@axium/core/node/io';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { fetchAPI, setPrefix, setToken } from '../requests.js';
import { getCurrentSession } from '../user.js';

const axcDir = join(homedir(), '.axium/client');
mkdirSync(axcDir, { recursive: true });

const CachedSessionInfo = Session.extend({ user: User });

const ClientCache = z.object({
	fetched: z.int(),
	session: CachedSessionInfo,
	apps: App.array(),
});

const ClientConfig = z.object({
	token: z.base64().nullish(),
	server: z.url().nullish(),
	// Cache to reduce server load:
	cache: ClientCache.nullish(),
});

export interface ClientConfig extends z.infer<typeof ClientConfig> {}

export let config: ClientConfig;

export function loadConfig() {
	try {
		config = ClientConfig.parse(JSON.parse(readFileSync(join(axcDir, 'config.json'), 'utf-8')));
		if (config.server) setPrefix(config.server);
		if (config.token) setToken(config.token);
	} catch (e: any) {
		io.debug('Failed to load session: ' + (e instanceof z.core.$ZodError ? z.prettifyError(e) : e.message));
	}
}

export function saveConfig(session: Omit<ClientConfig, 'fetched'>) {
	const path = join(axcDir, 'config.json');
	Object.assign(session, { fetched: Date.now() });

	writeFileSync(
		path,
		JSON.stringify(session, null, 4).replaceAll(/^( {4})+/g, match => '\t'.repeat(match.length / 4)),
		'utf-8'
	);
	io.debug('Saved session to ' + path);
}

export function resolveServerURL(server: string) {
	if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'https://' + server;

	const url = new URL(server);
	if (url.pathname.endsWith('/api')) url.pathname += '/';
	else if (url.pathname.at(-1) == '/' && !url.pathname.endsWith('/api/')) url.pathname += 'api/';

	if (url.pathname != '/api/') io.warn('Resolved server URL is not at the top level: ' + url.href);
	else io.debug('Resolved server URL: ' + url.href);

	return url.href;
}

export const _dayMs = 24 * 3600_000;

export async function updateCache(force: boolean) {
	if (!force && config.cache && config.cache.fetched + _dayMs > Date.now()) return;
	io.start('Fetching metadata');

	const [session, apps] = await Promise.all([getCurrentSession(), fetchAPI('GET', 'apps')]).catch(err => io.exit(err.message));

	try {
		config.cache = { fetched: Date.now(), session, apps };
		io.done();
	} catch {
		return;
	}
}
