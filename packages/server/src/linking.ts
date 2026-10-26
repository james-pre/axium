import { plugins } from '@axium/core/plugins';
import * as io from 'ioium/node';
import { existsSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path/posix';
import config from './config.js';

function resolveLink(id: string): string {
	return join(config.web.routes, `(${id.startsWith('#') ? id.slice(1) : id.replaceAll('/', '__')})`);
}

export interface LinkInfo {
	id: string;
	from: string;
	to: string;
}

export interface LinkOptions {
	only?: string[];
}

export function* listRouteLinks(options: LinkOptions = {}): Generator<LinkInfo> {
	if (!options.only || !options.only.length) {
		const link = resolveLink('#builtin');
		yield { id: '#builtin', from: link, to: resolve(import.meta.dirname, '../routes') };
	}

	for (const plugin of plugins.values()) {
		if (!plugin.server?.routes) continue;
		if (options.only && options.only.length && !options.only.includes(plugin.name)) continue;

		const link = resolveLink(plugin.name);

		const to = resolve(join(plugin.dirname, plugin.server.routes));
		yield { id: plugin.name, from: link, to };
	}
}

/**
 * Symlinks .svelte page routes for plugins and the server into a project's routes directory.
 */
export function linkRoutes(options: LinkOptions = {}) {
	for (const info of listRouteLinks(options)) {
		const { from, to } = info;

		if (existsSync(from)) {
			unlinkSync(from);
		}

		io.debug('Linking routes:', from, '->', to);
		symlinkSync(to, from, 'dir');
	}
}

export function writePluginHooks() {
	const hooksPath = join(import.meta.dirname, '../.hooks.js');
	const root = resolve(import.meta.dirname, '..');
	let hooks = `// auto-generated plugin hooks //\nimport { Plugin, register } from '@axium/core/plugins';\n`;
	for (const plugin of plugins.values()) {
		const importName = plugin.name.replaceAll(/\W/g, '_');
		hooks += `import ${importName} from '${relative(root, plugin.path)}' with { type: 'json' };\n`;
		hooks += `register(Plugin.parse({ ...${importName}, ...${importName}.axium }));\n`;
		if (!plugin.server?.web_client_hooks) continue;
		hooks += `import '${relative(root, resolve(plugin.dirname, plugin.server.web_client_hooks))}';\n`;
	}
	hooks += `export * from '@axium/client/web/hooks';\n`;
	writeFileSync(hooksPath, hooks, 'utf8');
	io.debug('Wrote hooks to', hooksPath);
}

export function unlinkRoutes(options: LinkOptions = {}) {
	for (const info of listRouteLinks(options)) {
		const { from } = info;
		if (!existsSync(from)) return;

		io.debug('Unlinking routes:', from);
		unlinkSync(from);
	}
}
