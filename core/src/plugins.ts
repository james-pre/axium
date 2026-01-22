import * as z from 'zod';
import { App } from './apps.js';
import { debug, warn } from './io.js';
import { zAsyncFunction } from './schemas.js';

const fn = z.custom<(...args: any[]) => any>(data => typeof data === 'function');

export const PluginServerHooks = z.object({
	statusText: zAsyncFunction(z.function({ input: [], output: z.string() })).optional(),
	remove: fn.optional(),
	clean: fn.optional(),
	load: fn.optional(),
});

interface _InitOptions {
	force?: boolean;
	skip: boolean;
	check: boolean;
}

export interface ServerHooks {
	statusText?(): string | Promise<string>;
	remove?: (opt: { force?: boolean }) => void | Promise<void>;
	clean?: (opt: Partial<_InitOptions>) => void | Promise<void>;
	load?(): void | Promise<void>;
}

export interface ClientHooks {
	run(): void | Promise<void>;
}

const PluginCommon = z.object({
	/** CLI mixin path */
	cli: z.string().optional(),
	/** The path to the hooks script */
	hooks: z.string().optional(),
	/** A map of plugin names to paths */
	integrations: z.record(z.string(), z.string()).optional(),
});

export const Plugin = z.looseObject({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	apps: z.array(App).optional(),
	client: PluginCommon.extend({}).optional(),
	server: PluginCommon.extend({
		http_handler: z.string().optional(),
		/** The path to the HTTP handler used by the server */
		routes: z.string().optional(),
		db: z.string().optional(),
		web_client_hooks: z.string().optional(),
	}).optional(),
	/** If set Axium can check the npm registry for updates */
	update_checks: z.boolean().nullish(),
	/** In plugin's packages, this is the default. At runtime this is the loaded config */
	config: z.record(z.string(), z.any()).optional(),
});

export interface Plugin extends z.infer<typeof Plugin> {}

export const PluginInfo = z.object({
	path: z.string(),
	dirname: z.string(),
	specifier: z.string(),
	loadedBy: z.string(),
	cli: z.string().optional(),
	/** @internal */
	_hooks: PluginServerHooks.optional(),
	/** @internal */
	_client: z.any().optional(),
	isServer: z.boolean(),
	_db: z.any().optional(),
	_configPath: z.string().optional(),
});

export interface PluginInfo extends z.infer<typeof PluginInfo> {}

export const PluginInternal = z.looseObject({ ...Plugin.shape, ...PluginInfo.shape });

export interface PluginInternal extends Plugin, PluginInfo {}

export const plugins = new Map<string, PluginInternal>();

/**
 * @internal
 */
export function _findPlugin(search: string): PluginInternal {
	const plugin = plugins.get(search) ?? plugins.values().find(p => p.specifier.toLowerCase() == search.toLowerCase());
	if (!plugin) throw `Can't find a plugin matching "${search}"`;
	return plugin;
}

export async function runIntegrations() {
	for (const [pluginName, plugin] of plugins) {
		const { integrations } = plugin[plugin.isServer ? 'server' : 'client']!;
		if (!integrations) continue;
		for (const [name, path] of Object.entries(integrations)) {
			if (!plugins.has(name)) continue;
			debug(`Running ${pluginName} integration with ${name}`);
			await import(path).catch(e => {
				const text = e instanceof Error ? e.stack : String(e);
				warn(`Failed to load ${pluginName} integration with ${name}:\n\t${text}`);
			});
		}
	}
}

export interface $PluginConfigs {}

interface PluginConfigData {
	schema: z.ZodObject;
	labels: Record<string, string>;
}

export const serverConfigs = new Map<string, PluginConfigData>();

export function setServerConfig(pluginName: string, schema: z.ZodObject, labels: Record<string, string> = {}) {
	serverConfigs.set(pluginName, { schema, labels });
}

export function getConfig<T extends string>(pluginName: T): T extends keyof $PluginConfigs ? $PluginConfigs[T] : Record<string, unknown> {
	const plugin = _findPlugin(pluginName);
	return plugin.config as any;
}

export const PluginUpdate = z.object({
	plugin: z.string(),
	config: z.record(z.string(), z.any()).optional(),
});

/**
 * Transforms a plugin name into a string suitable for use with file systems.
 */
export function toBaseName(pluginName: string): string {
	if (pluginName[0] == '@') pluginName = pluginName.slice(1);
	return pluginName.replaceAll('/', '_');
}
