import { output } from '@axium/core/node/io';
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
	}
}

function _locatePlugin(specifier: string, _loadedBy: string): string {
	if (specifier[0] == '/' || specifier.startsWith('./') || specifier.startsWith('../')) {
		return resolve(dirname(_loadedBy), specifier);
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
) {
	try {
		const path = _locatePlugin(specifier, _loadedBy);

		let imported: any;
		try {
			imported = JSON.parse(fs.readFileSync(path, 'utf8'));
		} catch (e) {
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

			if (mode == 'server') {
				if (plugin.server!.hooks) Object.assign(plugin, { _hooks: await import(resolve(plugin.dirname, plugin.server!.hooks)) });
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
		output.debug(`Loaded plugin: ${plugin.name} ${plugin.version}`);
	} catch (e: any) {
		output.warn(`Failed to load plugin from ${specifier}: ${e ? (e instanceof Error ? e.message : e.toString()) : e}`);
	}
}
