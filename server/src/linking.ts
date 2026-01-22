import * as io from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import { existsSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path/posix';
import config from './config.js';

const textFor: Record<string, string> = {
	builtin: 'built-in routes',
};

function info(id: string): [text: string, link: string] {
	const text = id.startsWith('#') ? textFor[id.slice(1)] : `routes for plugin: ${id}`;
	const link = join(config.web.routes, `(${id.startsWith('#') ? id.slice(1) : id.replaceAll('/', '__')})`);
	return [text, link];
}

interface LinkInfo {
	id: string;
	from: string;
	to: string;
	text: string;
}

export interface LinkOptions {
	only?: string[];
}

export function* listRouteLinks(options: LinkOptions = {}): Generator<LinkInfo> {
	if (!options.only) {
		const [text, link] = info('#builtin');
		yield { text, id: '#builtin', from: link, to: resolve(import.meta.dirname, '../routes') };
	}

	for (const plugin of plugins.values()) {
		if (!plugin.server?.routes) continue;
		if (options.only && !options.only.includes(plugin.name)) continue;

		const [text, link] = info(plugin.name);

		const to = resolve(join(plugin.dirname, plugin.server.routes));
		yield { text, id: plugin.name, from: link, to };
	}
}

/**
 * Symlinks .svelte page routes for plugins and the server into a project's routes directory.
 */
export function linkRoutes(options: LinkOptions = {}) {
	for (const info of listRouteLinks(options)) {
		const { text, from, to } = info;

		io.start('Linking ' + text);
		if (existsSync(from)) {
			io.warn('already exists.');

			io.start('Unlinking ' + text);
			try {
				unlinkSync(from);
			} catch (e: any) {
				io.exit(e);
			}
			io.done();

			io.start('Re-linking ' + text);
		}

		try {
			symlinkSync(to, from, 'dir');
			io.done();
		} catch (e: any) {
			io.exit(e);
		}
	}
}

export function writePluginHooks() {
	const hooksPath = join(import.meta.dirname, '../.hooks.js');
	io.start('Writing web client hooks for plugins');
	let hooks = `// auto-generated plugin hooks //\n`;
	for (const plugin of plugins.values()) {
		if (!plugin.server?.web_client_hooks) continue;
		const specifier = relative(resolve(import.meta.dirname, '..'), resolve(plugin.dirname, plugin.server.web_client_hooks));
		hooks += `import '${specifier}';\n`;
	}
	writeFileSync(hooksPath, hooks, 'utf8');
	io.done();
	io.debug('Wrote', hooksPath);
}

export function unlinkRoutes(options: LinkOptions = {}) {
	for (const info of listRouteLinks(options)) {
		const { text, from } = info;
		if (!existsSync(from)) return;
		io.start('Unlinking ' + text);
		try {
			unlinkSync(from);
			io.done();
		} catch (e: any) {
			io.exit(e);
		}
	}
}
