import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import { styleText } from 'node:util';

export default {
	server: {
		strictPort: true,
		port: 443,
	},
	preview: {
		strictPort: true,
		port: 443,
	},
	plugins: [sveltekit(), mkcert({ hosts: ['test.localhost'] })],
	esbuild: {
		target: 'es2022',
		sourceRoot: 'web',
	},
	ssr: {
		external: ['@axium/server/serve', '@axium/server/sveltekit'],
	},
	build: {
		rollupOptions: {
			external: [/^@axium\/server(?!\/components)/gim],
		},
	},
} satisfies UserConfig;
