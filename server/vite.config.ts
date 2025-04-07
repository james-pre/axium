import { sveltekit } from '@sveltejs/kit/vite';
import mkcert from 'vite-plugin-mkcert';
import type { UserConfig } from 'vite';

export default {
	server: {
		strictPort: true,
		port: 443,
	},
	plugins: [
		sveltekit(),
		mkcert({
			hosts: ['axium.localhost'],
		}),
	],
	esbuild: {
		target: 'es2021',
		sourceRoot: 'web',
	},
} satisfies UserConfig;
