import * as io from '@axium/core/node/io';
import { loadPlugin } from '@axium/core/node/plugins';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { ClientConfig, config } from '../config.js';
import { fetchAPI, setPrefix, setToken } from '../requests.js';
import { getCurrentSession } from '../user.js';

export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'axium');
mkdirSync(configDir, { recursive: true });
const axcConfig = join(configDir, 'config.json');
if (!existsSync(axcConfig)) writeFileSync(axcConfig, '{}');

export const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'axium');
mkdirSync(cacheDir, { recursive: true });

export function session() {
	if (!config.token) io.exit('Not logged in.', 4);
	if (!config.cache) io.exit('No session data available.', 3);
	return config.cache.session;
}

export async function loadConfig(safe: boolean) {
	try {
		Object.assign(config, io.readJSON(axcConfig, ClientConfig));
		if (config.server) setPrefix(config.server);
		if (config.token) setToken(config.token);
		for (const plugin of config.plugins ?? []) await loadPlugin('client', plugin, axcConfig, safe);
	} catch (e: any) {
		io.warn(
			'Failed to load config: ' +
				(e instanceof z.core.$ZodError
					? z.prettifyError(e)
					: e instanceof Error
						? io._debugOutput
							? e.stack
							: e.message
						: String(e))
		);
	}
}

export function saveConfig() {
	io.writeJSON(axcConfig, config);
	io.debug('Saved config to ' + axcConfig);
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
