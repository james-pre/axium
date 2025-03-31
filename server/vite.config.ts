import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

export default {
	plugins: [sveltekit()],
	esbuild: {
		target: 'es2021',
	},
} satisfies UserConfig;
