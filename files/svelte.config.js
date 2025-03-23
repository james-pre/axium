import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess({ script: true }),
	kit: {
		adapter: node({
			fallback: 'index.html',
			strict: true,
		}),
		alias: {
			$components: './components',
			$stores: './stores',
			$lib: './lib',
		},
		files: {
			routes: './routes',
			lib: './lib',
			assets: './static',
			appTemplate: './app.html',
			hooks: {
				server: './hooks.server.ts',
			},
		},
	},
};
