import nodeAdapter from '@sveltejs/adapter-node';
import { sveltekit, type Config as SvelteKitConfig } from '@sveltejs/kit/vite';
import { devNull } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, type WithRequired } from 'utilium';
import { createBuilder, type InlineConfig, type Plugin } from 'vite';
import config from './config.js';
import { overrideWrite } from './io.js';

const svelteKitConfig: SvelteKitConfig = {
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			return !w.code.startsWith('a11y') && w.code != 'state_referenced_locally';
		},
		experimental: {
			async: true,
		},
	},
	adapter: nodeAdapter(),
	files: {
		assets: join(fileURLToPath(new URL(import.meta.resolve('@axium/client'))), '../../assets'),
		appTemplate: join(import.meta.dirname, '../template.html'),
		routes: config.web.routes,
		serviceWorker: fileURLToPath(import.meta.resolve('@axium/client/web/service-worker')),
		hooks: {
			universal: devNull,
			client: join(import.meta.dirname, '../.hooks.js'),
		},
	},
	serviceWorker: { register: false },
	paths: { relative: false },
};

const baseViteConfig: WithRequired<InlineConfig, 'build'> = {
	configFile: false,
	appType: 'custom',
	server: {
		strictPort: true,
		port: 443,
	},
	ssr: {
		external: ['@axium/server'],
		noExternal: ['cookie'],
	},
	optimizeDeps: {
		exclude: [],
		include: ['@axium/client/components'],
	},
	build: {
		rollupOptions: {
			external: ['@axium/server'],
		},
		cssMinify: false,
	},
	logLevel: 'silent',
};

const _circularDepWarning = /Circular dependency: (\.\.\/)*node_modules/;

function allowWrite(text: string, stack?: string) {
	return !stack?.includes('svelte') && !stack?.includes('vite') && !stack?.includes('rollup') && !_circularDepWarning.test(text);
}

export interface BuildOptions {
	/**
	 * If set all of the output from Vite and Svelte/SvelteKit will be shown.
	 * This is usually undesirable.
	 */
	verbose?: boolean;

	/** Whether to minify the output */
	minify?: boolean;
}

export interface BuildStats {
	/** Build time in milliseconds */
	time: number;
	/** Bundle size in bytes */
	size: bigint;
}

export async function build(options: BuildOptions = {}): Promise<BuildStats> {
	using override = overrideWrite(allowWrite, process.stdout, process.stderr);
	if (options.verbose) override.cancel();

	const startTime = performance.now();

	let size = 0n;
	const bundleSize: Plugin = {
		name: 'axium:bundle-size',
		generateBundle(_, bundle) {
			for (const output of Object.values(bundle)) {
				size += BigInt(output.type === 'chunk' ? output.code.length : output.source.length);
			}
		},
	};

	const builder = await createBuilder({
		...baseViteConfig,
		logLevel: options.verbose ? 'info' : 'silent',
		build: pick(options, 'minify'),
		plugins: [...(await sveltekit(svelteKitConfig)), bundleSize],
	});

	await builder.buildApp();

	return { time: Math.round(performance.now() - startTime), size };
}
