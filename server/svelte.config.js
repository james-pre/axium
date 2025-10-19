import node from '@sveltejs/adapter-node';
import { join } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import config from '@axium/server/config';

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
			assets: join(fileURLToPath(new URL(import.meta.resolve('@axium/client'))), '../../assets'),
			appTemplate: join(import.meta.dirname, 'template.html'),
			routes: config.web.routes,
			hooks: {
				universal: '/dev/null',
			},
		},
	},
	vitePlugin: {
		// Fixes a problem where Vite does something that results in the virtual CSS file just being the entire svelte component, which is obviously invalid CSS.
		emitCss: false,
	},
};
