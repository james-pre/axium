import config from '@axium/server/config';
import node from '@sveltejs/adapter-node';
import { join } from 'node:path/posix';
import { fileURLToPath } from 'node:url';

/**
 * Paths relative to the directory of this file.
 * This allows this file to be imported from other projects and still resolve to the correct paths.
 */
const fixed = p => join(import.meta.dirname, p);

/** @type {import('@sveltejs/kit').Config} */
export default {
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			if (w.code.startsWith('a11y')) return false;
		},
	},
	kit: {
		adapter: node(),
		files: {
			routes: config.web.routes,
			assets: join(fileURLToPath(new URL(import.meta.resolve('@axium/client'))), '../../assets'),
			appTemplate: fixed('web/template.html'),
			hooks: {
				server: fixed('web/hooks.server.ts'),
			},
		},
	},
	vitePlugin: {
		// Fixes a problem where Vite does something that results in the virtual CSS file just being the entire svelte component, which is obviously invalid CSS.
		emitCss: false,
	},
};
