import { existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path/posix';
import config from './config.js';
import * as io from './io.js';
import { getSpecifier, plugins } from './plugins.js';

const textFor: Record<string, string> = {
	builtin: 'built-in routes',
};

function info(id: string): [text: string, link: string] {
	const text = id.startsWith('#') ? textFor[id.slice(1)] : `routes for plugin: ${id}`;
	const link = join(config.web.routes, `(${id.startsWith('#') ? id.slice(1) : id.replaceAll('/', '__')}`);
	return [text, link];
}

export function* listRouteLinks(): Generator<{ id: string; from: string; to: string }> {
	const [, link] = info('#builtin');
	yield { id: '#builtin', from: resolve(import.meta.dirname, '../routes'), to: link };

	for (const plugin of plugins) {
		if (!plugin.routes) continue;

		const [, link] = info(plugin.name);
		yield { id: plugin.name, from: join(import.meta.resolve(getSpecifier(plugin)), plugin.routes), to: link };
	}
}

function createLink(id: string, routes: string) {
	const [text, link] = info(id);
	if (existsSync(link)) {
		io.warn('already exists.');

		io.start('Unlinking ' + text);
		try {
			unlinkSync(link);
		} catch (e: any) {
			io.exit(e && e instanceof Error ? e.message : e.toString());
		}
		io.done();

		io.start('Re-linking ' + text);
	}

	try {
		symlinkSync(routes, link, 'dir');
	} catch (e: any) {
		io.exit(e && e instanceof Error ? e.message : e.toString());
	}
}

/**
 * Symlinks .svelte page routes for plugins and the server into a project's routes directory.
 */
export function linkRoutes() {
	io.start('Linking built-in routes');
	createLink('#builtin', resolve(import.meta.dirname, '../routes'));

	for (const plugin of plugins) {
		if (!plugin.routes) continue;

		io.start(`Linking routes for plugin: ${plugin.name}`);

		createLink(plugin.name, join(import.meta.resolve(getSpecifier(plugin)), plugin.routes));
	}
}

function removeLink(id: string) {
	const [text, link] = info(id);
	if (!existsSync(link)) return;
	io.start('Unlinking ' + text);
	try {
		unlinkSync(link);
	} catch (e: any) {
		io.exit(e && e instanceof Error ? e.message : e.toString());
	}
	io.done();
}

export function unlinkRoutes() {
	removeLink('#builtin');

	for (const plugin of plugins) {
		removeLink(plugin.name);
	}
}
