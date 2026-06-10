import { loadPlugin } from '@axium/core/node/plugins';
import * as io from 'ioium/node';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import { ClientConfig, config } from '../config.js';
import { setPrefix, setToken } from '../requests.js';
import * as cache from './cache.js';

export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'axium');
mkdirSync(configDir, { recursive: true });
const axcConfig = join(configDir, 'config.json');
if (!existsSync(axcConfig)) writeFileSync(axcConfig, '{}');

export function session() {
	if (!config.token) io.exit('Not logged in.', 4);
	if (!cache.meta.data) io.exit('No session data available.', 3);
	return cache.meta.data.session;
}

export async function loadConfig(safe: boolean) {
	try {
		Object.assign(config, io.readJSON(axcConfig, ClientConfig));
		if (config.server) setPrefix(config.server);
		if (config.token) setToken(config.token);
		for (const plugin of config.plugins ?? []) await loadPlugin('client', plugin, axcConfig, safe);
	} catch (e: any) {
		io.warn('Failed to load config: ' + io.errorText(e));
	}
}

export function saveConfig() {
	io.writeJSON(axcConfig, config);
	io.debug('Saved config to ' + axcConfig);
}
