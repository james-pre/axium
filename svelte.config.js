import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess({ script: true }),
	kit: {
		adapter: adapter({
			fallback: 'index.html',
			strict: true,
		}),
		alias: {
			$components: 'web/components',
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
