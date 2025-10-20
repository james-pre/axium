import * as z from 'zod';
import { zAsyncFunction } from './schemas.js';
import { App } from './apps.js';

export const Plugin = z.looseObject({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	/** The path to the hooks script */
	hooks: z.string().optional(),
	/** The path to the HTTP handler */
	http_handler: z.string().optional(),
	apps: z.array(App).optional(),
	routes: z.string().optional(),
});

export type Plugin = z.infer<typeof Plugin>;

export interface PluginInternal extends Plugin {
	readonly path: string;
	readonly dirname: string;
	readonly specifier: string;
	readonly _loadedBy: string;
	readonly _hooks?: Hooks;
}

const fn = z.custom<(...args: any[]) => any>(data => typeof data === 'function');

export const PluginHooks = z.object({
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

export interface Hooks {
	statusText?(): string | Promise<string>;
	db_init?: (opt: _InitOptions) => void | Promise<void>;
	remove?: (opt: { force?: boolean }) => void | Promise<void>;
	db_wipe?: (opt: { force?: boolean }) => void | Promise<void>;
	clean?: (opt: Partial<_InitOptions>) => void | Promise<void>;
}
