import * as fs from 'node:fs';
import { join, resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import z from 'zod/v4';
import { findDir, output } from './io.js';
import { zAsyncFunction } from '@axium/core/schemas';

export const fn = z.custom<(...args: unknown[]) => any>(data => typeof data === 'function');

export const Plugin = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	statusText: zAsyncFunction(z.function({ input: [], output: z.string() })),
	db_init: fn.optional(),
	db_remove: fn.optional(),
	db_wipe: fn.optional(),
	db_clean: fn.optional(),
});

export interface Plugin extends z.infer<typeof Plugin> {}

export const plugins = new Set<Plugin>();

export function resolvePlugin(search: string): Plugin | undefined {
	for (const plugin of plugins) {
		if (plugin.name.startsWith(search) || plugin.id.startsWith(search)) return plugin;
	}
}

export function pluginText(plugin: Plugin): string {
	return [
		styleText('whiteBright', plugin.name),
		plugin.id,
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
		const plugin = await Plugin.parseAsync(await import(/* @vite-ignore */ specifier)).catch(e => {
			throw z.prettifyError(e);
		});
		plugins.add(plugin);
		output.debug(`Loaded plugin: "${plugin.name}" (${plugin.id}) ${plugin.version}`);
	} catch (e: any) {
		output.debug(`Failed to load plugin from ${specifier}: ${e.message || e}`);
	}
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

export async function loadDefaultPlugins() {
	await loadPlugins(join(findDir(true), 'plugins'));
	await loadPlugins(join(findDir(false), 'plugins'));
}
