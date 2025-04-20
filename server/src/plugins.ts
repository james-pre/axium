import * as fs from 'node:fs';
import { join } from 'node:path/posix';
import { styleText } from 'node:util';
import * as z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { findDir, output } from './io.js';

export const Plugin = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	statusText: z
		.function()
		.args()
		.returns(z.union([z.string(), z.promise(z.string())]))
		.optional(),
	db: z
		.object({
			init: z.function(),
			remove: z.function(),
			wipe: z.function(),
		})
		.optional(),
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
		`Status text integration: ${plugin.statusText ? styleText('whiteBright', 'yes') : styleText('yellow', 'no')}`,
		`Database integration: ${plugin.db ? 'yes' : 'no'}`,
	].join('\n');
}

export async function loadPlugin(specifier: string) {
	specifier = import.meta.resolve(specifier);
	const stats = fs.statSync(specifier);

	if (stats.isDirectory() || !['.js', '.mjs'].some(ext => specifier.endsWith(ext))) return;

	try {
		const plugin = await Plugin.parseAsync(await import(specifier)).catch(e => {
			throw fromZodError(e);
		});
		plugins.add(plugin);
		output.debug(`Loaded plugin: "${plugin.name}" (${plugin.id}) ${plugin.version}`);
	} catch (e: any) {
		output.debug(`Failed to load plugin from ${specifier}: ${e}`);
	}
}

export async function loadPlugins(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
	const files = fs.readdirSync(dir);
	for (const file of files) {
		await loadPlugin(join(dir, file));
	}
}

export async function loadDefaultPlugins() {
	await loadPlugins(join(findDir(true), 'plugins'));
	await loadPlugins(join(findDir(false), 'plugins'));
}
