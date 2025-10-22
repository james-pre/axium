import { App, Session, User } from '@axium/core';
import * as io from '@axium/core/node/io';
import { loadPlugin } from '@axium/core/node/plugins';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { fetchAPI, setPrefix, setToken } from '../requests.js';
import { getCurrentSession } from '../user.js';

export const configDir = join(homedir(), '.config/axium');
mkdirSync(configDir, { recursive: true });
const axcConfig = join(configDir, 'config.json');

const ClientConfig = z.looseObject({
	token: z.base64().nullish(),
	server: z.url().nullish(),
	// Cache to reduce server load:
	cache: z
		.looseObject({
			fetched: z.int(),
			session: Session.extend({ user: User }),
			apps: App.array(),
		})
		.nullish(),
	plugins: z.string().array().default([]),
});

export interface ClientConfig extends z.infer<typeof ClientConfig> {}

export let config: ClientConfig;

export function session() {
	if (!config.token) io.exit('Not logged in.', 4);
	if (!config.cache) io.exit('No session data available.', 3);
	return config.cache.session;
}

export async function loadConfig(safe: boolean) {
	try {
		config = ClientConfig.parse(JSON.parse(readFileSync(axcConfig, 'utf-8')));
		if (config.server) setPrefix(config.server);
		if (config.token) setToken(config.token);
		for (const plugin of config.plugins ?? []) await loadPlugin('client', plugin, axcConfig, safe);
	} catch (e: any) {
		io.warn('Failed to load config: ' + (e instanceof z.core.$ZodError ? z.prettifyError(e) : e.message));
	}
}

export function saveConfig() {
	io.writeJSON(axcConfig, config);
	io.debug('Saved config to ' + axcConfig);
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
		saveConfig();
		io.done();
	} catch {
		return;
	}
}
