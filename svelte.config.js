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
			$components: 'src/web/components',
			$stores: 'src/web/stores',
			$lib: 'src/web/lib',
		},
		files: {
			routes: 'src/web/routes',
			lib: 'src/web/lib',
			assets: 'src/web/static',
			appTemplate: 'src/web/app.html',
			hooks: {
				server: 'src/web/hooks.server.ts',
			},
		},
	},
};
