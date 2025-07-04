import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default {
	server: {
		strictPort: true,
		port: 443,
	},
	plugins: [sveltekit(), mkcert({ hosts: ['test.localhost'] })],
	esbuild: {
		target: 'es2022',
		sourceRoot: 'web',
	},
	build: {
		rollupOptions: {
			external: [/@axium\/server(\/.*)?/],
		},
	},
} satisfies UserConfig;
