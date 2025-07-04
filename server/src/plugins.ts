import { zAsyncFunction } from '@axium/core/schemas';
import * as fs from 'node:fs';
import { resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import z from 'zod/v4';
import { output } from './io.js';
import { _unique } from './state.js';

export const fn = z.custom<(...args: unknown[]) => any>(data => typeof data === 'function');

export const Plugin = z.object({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	statusText: zAsyncFunction(z.function({ input: [], output: z.string() })),
	db_init: fn.optional(),
	db_remove: fn.optional(),
	db_wipe: fn.optional(),
	db_clean: fn.optional(),
});

const kSpecifier = Symbol('specifier');

export interface Plugin extends z.infer<typeof Plugin> {
	[kSpecifier]: string;
}

export const plugins = _unique('plugins', new Set<Plugin>());

export function resolvePlugin(search: string): Plugin | undefined {
	for (const plugin of plugins) {
		if (plugin.name.startsWith(search)) return plugin;
	}
}

export function pluginText(plugin: Plugin): string {
	return [
		styleText('whiteBright', plugin.name),
		`Version: ${plugin.version}`,
		`Description: ${plugin.description ?? styleText('dim', '(none)')}`,
		`Database integration: ${
			[plugin.db_init, plugin.db_remove, plugin.db_wipe]
				.filter(Boolean)
				.map(fn => fn?.name.slice(3))
				.join(', ') || styleText('dim', '(none)')
		}`,
	].join('\n');
}

export async function loadPlugin(specifier: string) {
	try {
		const imported = await import(/* @vite-ignore */ specifier);

		const maybePlugin = 'default' in imported ? imported.default : imported;

		const plugin: Plugin = Object.assign(
			await Plugin.parseAsync(maybePlugin).catch(e => {
				throw z.prettifyError(e);
			}),
			{ [kSpecifier]: specifier }
		);

		plugins.add(plugin);
		output.debug(`Loaded plugin: ${plugin.name} ${plugin.version}`);
	} catch (e: any) {
		output.debug(`Failed to load plugin from ${specifier}: ${e.message || e}`);
	}
}

export function getSpecifier(plugin: Plugin): string {
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
