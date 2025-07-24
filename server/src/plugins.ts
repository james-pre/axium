import { zAsyncFunction } from '@axium/core/schemas';
import * as fs from 'node:fs';
import { resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import * as z from 'zod';
import type { Database, InitOptions, OpOptions } from './database.js';
import { output } from './io.js';
import { _unique } from './state.js';

export const PluginMetadata = z.looseObject({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	routes: z.string().optional(),
});

const hookNames = ['db_init', 'remove', 'db_wipe', 'clean'] as const satisfies (keyof Hooks)[];

const fn = z.custom<(...args: any[]) => any>(data => typeof data === 'function');
export const Plugin = PluginMetadata.extend({
	statusText: zAsyncFunction(z.function({ input: [], output: z.string() })),
	hooks: z.partialRecord(z.literal(hookNames), fn).optional(),
});

const kSpecifier = Symbol('specifier');

export type Plugin = z.infer<typeof Plugin>;

interface PluginInternal extends Plugin {
	[kSpecifier]: string;
	hooks: Hooks;
}

export interface Hooks {
	db_init?: (opt: InitOptions, db: Database) => void | Promise<void>;
	remove?: (opt: { force?: boolean }, db: Database) => void | Promise<void>;
	db_wipe?: (opt: OpOptions, db: Database) => void | Promise<void>;
	clean?: (opt: Partial<OpOptions>, db: Database) => void | Promise<void>;
}

export const plugins = _unique('plugins', new Set<PluginInternal>());

export function resolvePlugin(search: string): PluginInternal | undefined {
	for (const plugin of plugins) {
		if (plugin.name === search) return plugin;
	}
}

export function pluginText(plugin: PluginInternal): string {
	return [
		styleText('whiteBright', plugin.name),
		`Version: ${plugin.version}`,
		`Description: ${plugin.description ?? styleText('dim', '(none)')}`,
		`Hooks: ${Object.keys(plugin.hooks).join(', ') || styleText('dim', '(none)')}`,
		// @todo list the routes when debug output is enabled
		`Routes: ${plugin.routes || styleText('dim', '(none)')}`,
	].join('\n');
}

export async function loadPlugin(specifier: string) {
	try {
		const imported = await import(/* @vite-ignore */ specifier);

		const maybePlugin = 'default' in imported ? imported.default : imported;

		const plugin: PluginInternal = Object.assign(
			{ hooks: {}, [kSpecifier]: specifier },
			await Plugin.parseAsync(maybePlugin).catch(e => {
				throw z.prettifyError(e);
			})
		);

		if (plugin.name.startsWith('#') || plugin.name.includes(' ')) {
			throw 'Invalid plugin name. Plugin names can not start with a hash or contain spaces.';
		}

		plugins.add(plugin);
		output.debug(`Loaded plugin: ${plugin.name} ${plugin.version}`);
	} catch (e: any) {
		output.debug(`Failed to load plugin from ${specifier}: ${e ? (e instanceof Error ? e.message : e.toString()) : e}`);
	}
}

export function getSpecifier(plugin: PluginInternal): string {
	return plugin[kSpecifier];
}

export async function loadPlugins(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const path = resolve(dir, file);
		const stats = fs.statSync(path);

		if (stats.isDirectory() || !['.js', '.mjs'].some(ext => path.endsWith(ext))) return;
		await loadPlugin(path);
	}
}
