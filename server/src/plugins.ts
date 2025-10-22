import { output } from '@axium/core/node/io';
import { Plugin, type PluginInternal } from '@axium/core/plugins';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import * as z from 'zod';
import { apps } from './apps.js';
import type { InitOptions, OpOptions } from './database.js';
import { _unique } from './state.js';

export interface Hooks {
	statusText?(): string | Promise<string>;
	db_init?: (opt: InitOptions) => void | Promise<void>;
	remove?: (opt: { force?: boolean }) => void | Promise<void>;
	db_wipe?: (opt: OpOptions) => void | Promise<void>;
	clean?: (opt: Partial<OpOptions>) => void | Promise<void>;
}

export const plugins = _unique('plugins', new Map<string, PluginInternal>());

export function pluginText(plugin: PluginInternal): string {
	return [
		styleText('whiteBright', plugin.name),
		`Version: ${plugin.version}`,
		`Description: ${plugin.description ?? styleText('dim', '(none)')}`,
		`Hooks: ${plugin._hooks ? styleText(['dim', 'bold'], `(${Object.keys(plugin._hooks).length}) `) + Object.keys(plugin._hooks).join(', ') : plugin.hooks || styleText('dim', '(none)')}`,
		`HTTP Handler: ${plugin.http_handler ?? styleText('dim', '(none)')}`,
	].join('\n');
}

function _locatePlugin(specifier: string, _loadedBy: string): string {
	if (specifier[0] == '/' || specifier.startsWith('./') || specifier.startsWith('../')) {
		return resolve(dirname(_loadedBy), specifier);
	}

	let packageDir = dirname(fileURLToPath(import.meta.resolve(specifier)));
	for (; !fs.existsSync(join(packageDir, 'package.json')); packageDir = dirname(packageDir));
	return join(packageDir, 'package.json');
}

export async function loadPlugin(specifier: string, _loadedBy: string, safeMode: boolean = false) {
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
			{ path, specifier, _loadedBy, dirname: dirname(path) }
		);

		if (!safeMode && plugin.hooks) {
			Object.assign(plugin, { _hooks: await import(resolve(plugin.dirname, plugin.hooks)) });
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
		output.debug(`Failed to load plugin from ${specifier}: ${e ? (e instanceof Error ? e.message : e.toString()) : e}`);
	}
}
