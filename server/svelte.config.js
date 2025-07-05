import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { join } from 'node:path/posix';

/**
 * Paths relative to the directory of this file.
 * This allows this file to be imported from other projects and still resolve to the correct paths.
 */
const fixed = p => join(import.meta.dirname, p);

/** @type {import('@sveltejs/kit').Config} */
export default {
	compilerOptions: {
		runes: true,
	},
	preprocess: vitePreprocess({ script: true }),
	vitePlugin: {
		exclude: '@axium/server/**',
	},
	kit: {
		adapter: node(),
		alias: {
			$stores: fixed('web/stores'),
			$lib: fixed('web/lib'),
		},
		files: {
			routes: 'routes',
			lib: fixed('web/lib'),
			assets: fixed('assets'),
			appTemplate: fixed('web/template.html'),
			hooks: {
				server: fixed('web/hooks.server.ts'),
			},
		},
	},
};
