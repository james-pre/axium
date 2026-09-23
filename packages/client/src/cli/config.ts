import { persistFeaturesTo } from '@axium/core/node/features';
import { type PluginLoadOptions, loadPlugin, trackPluginLoading } from '@axium/core/node/plugins';
import { Manager as ConfigManager } from '@james-pre/config';
import { debug, warn } from 'ioium';
import * as io from 'ioium/node';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { setPrefix, setToken } from '../requests.js';
import * as cache from './cache.js';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';

export function resolveServerURL(server: string) {
	if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'https://' + server;

	const url = new URL(server);
	if (url.pathname.endsWith('/api')) url.pathname += '/';
	else if (url.pathname.at(-1) == '/' && !url.pathname.endsWith('/api/')) url.pathname += 'api/';

	if (url.pathname != '/api/') warn('Resolved server URL is not at the top level: ' + url.href);
	else debug('Resolved server URL: ' + url.href);

	return url.href;
}

async function loadPlugins(path: string, options?: PluginLoadOptions): Promise<void> {
	for (const plugin of config.plugins ?? []) await loadPlugin('client', plugin, path, options);
}

export const configManager = new ConfigManager(
	z.looseObject({
		token: z.base64url().nullish(),
		server: z.url().nullish(),
		plugins: z.string().array().default([]),
	}),
	{ enableIncludes: true, xdg: 'axium/config' }
)
	.$loadOptions<{ plugins?: PluginLoadOptions }>()
	.on('change', () => {
		if (config.server) setPrefix(config.server);
		if (config.token) setToken(config.token);
	})
	.on('post_load', (path, file, options) => trackPluginLoading(loadPlugins(path, options.plugins)))
	.on('load_error', (path, stage, error) => io.warn('Failed to load config:', io.errorText(error)))
	.on('write', path => io.debug('Saved config to', path));

export const config = configManager.data;

export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'axium');
mkdirSync(configDir, { recursive: true });
persistFeaturesTo(join(configDir, 'features.json'));

export function session() {
	if (!config.token) io.exit('Not logged in.', 4);
	if (!cache.meta.data) io.exit('No session data available.', 3);
	return cache.meta.data.session;
}
