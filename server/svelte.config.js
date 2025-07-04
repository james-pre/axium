import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

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
			$stores: 'web/stores',
			$lib: 'web/lib',
		},
		files: {
			routes: 'web/routes',
			lib: 'web/lib',
			assets: 'web/static',
			appTemplate: 'web/app.html',
			hooks: {
				server: 'web/hooks.server.ts',
			},
		},
	},
};
