import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { join } from 'node:path/posix';
import config from '@axium/server/config';
import type { Config as SvelteKitConfig } from '@sveltejs/kit';

/**
 * Paths relative to the directory of this file.
 * This allows this file to be imported from other projects and still resolve to the correct paths.
 */
const fixed = (p: string) => join(import.meta.dirname, p);

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
			routes: config.web.routes,
			lib: fixed('web/lib'),
			assets: fixed('assets'),
			appTemplate: fixed('web/template.html'),
			hooks: {
				server: fixed('web/hooks.server.ts'),
			},
		},
	},
} satisfies SvelteKitConfig;
