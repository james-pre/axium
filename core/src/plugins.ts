import * as z from 'zod';
import { zAsyncFunction } from './schemas.js';
import { App } from './apps.js';
import { debug, warn } from './io.js';

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
	}).optional(),
});

export type Plugin = z.infer<typeof Plugin>;

export interface PluginInfo {
	path: string;
	dirname: string;
	specifier: string;
	loadedBy: string;
	cli?: string;
	/** @internal */
	_hooks?: ServerHooks;
	/** @internal */
	_client?: ClientHooks;
	isServer: boolean;
	_db?: any;
}

export interface PluginInternal extends Plugin, Readonly<PluginInfo> {}

export const plugins = new Map<string, PluginInternal>();

/**
 * @internal
 */
export function _findPlugin(search: string): PluginInternal {
	const plugin = plugins.get(search) ?? plugins.values().find(p => p.specifier.toLowerCase() == search.toLowerCase());
	if (!plugin) throw `Can't find a plugin matching "${search}"`;
	return plugin;
}

const fn = z.custom<(...args: any[]) => any>(data => typeof data === 'function');

export const PluginServerHooks = z.object({
	statusText: zAsyncFunction(z.function({ input: [], output: z.string() })).optional(),
	remove: fn.optional(),
	clean: fn.optional(),
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
}

export interface ClientHooks {
	run(): void | Promise<void>;
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
