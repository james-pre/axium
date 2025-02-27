import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	root: './src/web',
	build: {
		outDir: '../build/web',
		emptyOutDir: true,
		target: 'esnext',
	},
	esbuild: {
		target: 'es2022',
	},
});
