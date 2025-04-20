import * as fs from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { findDir, logger } from './io.js';

export const Plugin = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	statusText: z
		.function()
		.args()
		.returns(z.union([z.string(), z.promise(z.string())]))
		.optional(),
	db: z
		.object({
			init: z.function(),
			drop: z.function(),
			wipe: z.function(),
		})
		.optional(),
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Plugin extends z.infer<typeof Plugin> {}

export const plugins = new Set<Plugin>();

export async function loadPlugin(path: string) {
	const stats = fs.statSync(path);

	if (stats.isDirectory() || !['.js', '.mjs'].some(ext => path.endsWith(ext))) return;

	try {
		const plugin = Plugin.parse(await import(path));
		plugins.add(plugin);
		logger.debug(`Loaded plugin: "${plugin.name}" (${plugin.id}) ${plugin.version}`);
	} catch (e: any) {
		logger.debug(`Failed to load plugin from ${path}: ${e}`);
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
