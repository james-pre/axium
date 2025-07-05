import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { join } from 'node:path/posix';

const web = join(import.meta.dirname, 'web');

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
		adapter: node({
			fallback: 'index.html',
			strict: true,
		}),
		alias: {
			$stores: web + '/stores',
			$lib: web + '/lib',
		},
		files: {
			routes: web + '/routes',
			lib: web + '/lib',
			assets: web + '/assets',
			appTemplate: web + '/template.html',
			hooks: {
				server: web + '/hooks.server.ts',
			},
		},
	},
};
