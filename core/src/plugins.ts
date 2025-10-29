import * as z from 'zod';
import { zAsyncFunction } from './schemas.js';
import { App } from './apps.js';

export const Plugin = z.looseObject({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	apps: z.array(App).optional(),
	client: z
		.object({
			/** CLI mixin path */
			cli: z.string().optional(),
		})
		.optional(),
	server: z
		.object({
			/** The path to the hooks script */
			hooks: z.string().optional(),
			http_handler: z.string().optional(),
			/** The path to the HTTP handler used by the server */
			routes: z.string().optional(),
			/** CLI mixin path */
			cli: z.string().optional(),
		})
		.optional(),
});

export type Plugin = z.infer<typeof Plugin>;

export interface PluginInternal extends Plugin {
	readonly path: string;
	readonly dirname: string;
	readonly specifier: string;
	readonly _loadedBy: string;
	readonly cli?: string;
	/** @internal */
	readonly _hooks?: ServerHooks;
	readonly isServer: boolean;
}

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
	db_init: fn.optional(),
	remove: fn.optional(),
	db_wipe: fn.optional(),
	clean: fn.optional(),
});

interface _InitOptions {
	force?: boolean;
	skip: boolean;
	check: boolean;
}

export interface ServerHooks {
	statusText?(): string | Promise<string>;
	db_init?: (opt: _InitOptions) => void | Promise<void>;
	remove?: (opt: { force?: boolean }) => void | Promise<void>;
	db_wipe?: (opt: { force?: boolean }) => void | Promise<void>;
	clean?: (opt: Partial<_InitOptions>) => void | Promise<void>;
}
