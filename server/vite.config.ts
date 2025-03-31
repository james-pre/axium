import { sveltekit } from '@sveltejs/kit/vite';
import mkcert from 'vite-plugin-mkcert';
import type { UserConfig } from 'vite';

export default {
	plugins: [sveltekit(), mkcert()],
	esbuild: {
		target: 'es2021',
		sourceRoot: 'web',
	},
} satisfies UserConfig;
