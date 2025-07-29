import config from '@axium/server/config';
import node from '@sveltejs/adapter-node';
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
		warningFilter(w) {
			if (w.code.startsWith('a11y')) return false;
		},
	},
	kit: {
		adapter: node(),
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
};
