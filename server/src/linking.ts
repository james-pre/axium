import { existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path/posix';
import config from './config.js';
import * as io from './io.js';
import { plugins } from './plugins.js';

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

const packagesDir = join(import.meta.dirname, '../../..');

export function* listRouteLinks(): Generator<LinkInfo> {
	const [text, link] = info('#builtin');
	yield { text, id: '#builtin', from: link, to: resolve(import.meta.dirname, '../routes') };

	for (const plugin of plugins) {
		if (!plugin.routes) continue;

		const [text, link] = info(plugin.name);

		const to = join(packagesDir, plugin.name, plugin.routes);
		yield { text, id: plugin.name, from: link, to };
	}
}

/**
 * Symlinks .svelte page routes for plugins and the server into a project's routes directory.
 */
export function linkRoutes() {
	for (const info of listRouteLinks()) {
		const { text, from, to } = info;

		io.start('Linking ' + text);
		if (existsSync(from)) {
			io.warn('already exists.');

			io.start('Unlinking ' + text);
			try {
				unlinkSync(from);
			} catch (e: any) {
				io.exit(e && e instanceof Error ? e.message : e.toString());
			}
			io.done();

			io.start('Re-linking ' + text);
		}

		try {
			symlinkSync(to, from, 'dir');
			io.done();
		} catch (e: any) {
			io.exit(e && e instanceof Error ? e.message : e.toString());
		}
	}
}

export function unlinkRoutes() {
	for (const info of listRouteLinks()) {
		const { text, from } = info;
		if (!existsSync(from)) return;
		io.start('Unlinking ' + text);
		try {
			unlinkSync(from);
			io.done();
		} catch (e: any) {
			io.exit(e && e instanceof Error ? e.message : e.toString());
		}
	}
}
