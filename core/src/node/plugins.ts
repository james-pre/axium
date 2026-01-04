import * as io from '@axium/core/node/io';
import { Plugin, plugins, type PluginInternal } from '@axium/core/plugins';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import * as z from 'zod';
import { apps } from '../apps.js';

export function* pluginText(plugin: PluginInternal): Generator<string> {
	yield styleText('whiteBright', plugin.name);
	yield `Version: ${plugin.version}`;
	yield `Description: ${plugin.description ?? styleText('dim', '(none)')}`;
	yield `CLI Integration: ${plugin.cli ? 'Yes' : 'No'}`;

	if (plugin.isServer) {
		yield `Hooks: ${plugin._hooks ? styleText(['dim', 'bold'], `(${Object.keys(plugin._hooks).length}) `) + Object.keys(plugin._hooks).join(', ') : plugin.server!.hooks || styleText('dim', '(none)')}`;
		yield `HTTP Handler: ${plugin.server!.http_handler ?? styleText('dim', '(none)')}`;
	} else {
		yield `Hooks: ${plugin._client ? styleText(['dim', 'bold'], `(${Object.keys(plugin._client).length}) `) + Object.keys(plugin._client).join(', ') : plugin.client!.hooks || styleText('dim', '(none)')}`;
	}
}

function _locatePlugin(specifier: string, _loadedBy: string): string {
	if (specifier[0] == '/' || ['.', '..'].includes(specifier.split('/')[0])) {
		const path = resolve(dirname(_loadedBy), specifier);
		const stats = fs.statSync(path);
		if (stats.isFile()) return path;
		if (!stats.isDirectory()) throw new Error('Can not resolve plugin path: ' + path);
		return join(path, 'package.json');
	}

	let packageDir = dirname(fileURLToPath(import.meta.resolve(specifier)));
	for (; !fs.existsSync(join(packageDir, 'package.json')); packageDir = dirname(packageDir));
	return join(packageDir, 'package.json');
}

export async function loadPlugin<const T extends 'client' | 'server'>(
	mode: T,
	specifier: string,
	_loadedBy: string,
	safeMode: boolean = false
): Promise<PluginInternal | void> {
	try {
		const path = _locatePlugin(specifier, _loadedBy);
		io.debug(`Loading plugin at ${path} (from ${_loadedBy})`);

		let imported: any;
		try {
			imported = JSON.parse(fs.readFileSync(path, 'utf8'));
		} catch {
			throw new Error('Invalid or missing metadata for ' + specifier);
		}

		if ('axium' in imported) Object.assign(imported, imported.axium); // support axium field in package.json

		const plugin: PluginInternal = Object.assign(
			await Plugin.parseAsync(imported).catch(e => {
				throw e instanceof z.core.$ZodError ? z.prettifyError(e) : e;
			}),
			{ path, specifier, _loadedBy, dirname: dirname(path), cli: imported[mode]?.cli, isServer: mode === 'server' }
		);

		if (!plugin[mode]) throw `Plugin does not support running ${mode}-side`;

		if (!safeMode) {
			if (plugin.cli) await import(resolve(plugin.dirname, plugin.cli));

			if (mode == 'client') {
				if (plugin.client!.hooks) Object.assign(plugin, { _client: await import(resolve(plugin.dirname, plugin.client!.hooks)) });
			}

			if (mode == 'server') {
				const cfg = plugin.server!;

				if (cfg.hooks) Object.assign(plugin, { _hooks: await import(resolve(plugin.dirname, cfg.hooks)) });
				if (cfg.db) {
					const dbSchema = await import(resolve(plugin.dirname, cfg.db), { with: { type: 'json' } });
					Object.assign(plugin, { _db: dbSchema.default });
				}
			}
		}

		Object.freeze(plugin);

		if (plugins.has(plugin.name)) throw 'Plugin already loaded';

		if (plugin.name.startsWith('#') || plugin.name.includes(' ')) {
			throw 'Invalid plugin name. Plugin names can not start with a hash or contain spaces.';
		}

		for (const app of plugin.apps ?? []) {
			if (apps.has(app.id)) throw new ReferenceError(`App with ID "${app.id}" already exists.`);
			apps.set(app.id, app);
		}

		plugins.set(plugin.name, plugin);
		io.debug(`Loaded plugin: ${plugin.name} ${plugin.version}`);
		return plugin;
	} catch (e: any) {
		io.warn(`Failed to load plugin from ${specifier}: ${e ? (e instanceof Error ? e.message : e.toString()) : e}`);
	}
}
