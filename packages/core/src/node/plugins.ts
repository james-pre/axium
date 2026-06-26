import { Plugin, plugins, type PluginInternal } from '@axium/core/plugins';
import * as io from 'ioium/node';
import { dirname, resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import { _throw } from 'utilium';
import { apps } from '../apps.js';
import { getPackageJSON } from './packages.js';

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

/** Where the plugin is supposed to run */
export type PluginType = 'client' | 'server';

export interface PluginLoadOptions {
	/** Whether loading this plugin is required */
	required?: boolean;
	/** If set, do not run code from plugins */
	safe?: boolean;
	/**
	 * If set, we are reloading plugins (e.g. from a config reload)
	 * @todo actually support partially reloading plugins
	 */
	reload?: boolean;
}

export async function loadPlugin(
	type: PluginType,
	specifier: string,
	loadedBy: string,
	options: PluginLoadOptions & { required: true }
): Promise<PluginInternal>;
export async function loadPlugin(
	type: PluginType,
	specifier: string,
	loadedBy: string,
	options?: PluginLoadOptions & { required?: false }
): Promise<PluginInternal | null>;
export async function loadPlugin(
	type: PluginType,
	specifier: string,
	loadedBy: string,
	options?: PluginLoadOptions
): Promise<PluginInternal | null>;
export async function loadPlugin(
	type: PluginType,
	specifier: string,
	loadedBy: string,
	options: PluginLoadOptions = {}
): Promise<PluginInternal | null> {
	try {
		const imported = getPackageJSON(specifier, loadedBy);
		const path = imported.__path;

		io.debug(`Loading plugin at ${path} (from ${loadedBy})`);

		if ('axium' in imported) Object.assign(imported, imported.axium); // support axium field in package.json

		const plugin: PluginInternal = Object.assign(await Plugin.parseAsync(imported).catch(e => _throw(io.errorText(e))), {
			path,
			specifier,
			loadedBy,
			dirname: dirname(path),
			cli: imported[type]?.cli,
			isServer: type === 'server',
		});

		if (!plugin[type]) throw new Error(`Plugin does not support running ${type}-side`);

		if (!options.safe) {
			if (plugin.cli) await import(resolve(plugin.dirname, plugin.cli));

			if (type == 'client') {
				if (plugin.client!.hooks) Object.assign(plugin, { _client: await import(resolve(plugin.dirname, plugin.client!.hooks)) });
			}

			if (type == 'server') {
				const cfg = plugin.server!;

				if (cfg.hooks) Object.assign(plugin, { _hooks: await import(resolve(plugin.dirname, cfg.hooks)) });
				if (cfg.db) {
					const dbSchema = await import(resolve(plugin.dirname, cfg.db), { with: { type: 'json' } });
					Object.assign(plugin, { _db: dbSchema.default });
				}
			}
		}

		if (plugins.has(plugin.name)) throw new Error('Plugin already loaded');

		if (plugin.name.startsWith('#') || plugin.name.includes(' ')) {
			throw new Error('Invalid plugin name. Plugin names can not start with a hash or contain spaces.');
		}

		for (const app of plugin.apps ?? []) {
			if (apps.has(app.id)) throw new ReferenceError(`App with ID "${app.id}" already exists.`);
			apps.set(app.id, app);
		}

		plugins.set(plugin.name, plugin);
		io.debug(`Loaded plugin: ${plugin.name} ${plugin.version}`);
		return plugin;
	} catch (err: any) {
		if (options.required) throw err;
		io.warn(`Failed to load plugin '${specifier}': ${io.errorText(err)}`);
		return null;
	}
}
