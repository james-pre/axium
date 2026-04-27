import nodeAdapter from '@sveltejs/adapter-node';
import type { Config as SvelteConfig } from '@sveltejs/kit';
import { svelte as viteSveltePlugin, type Options as SvelteViteOptions } from '@sveltejs/vite-plugin-svelte';
import { exit } from 'ioium/node';
import { findPackageJSON } from 'node:module';
import { devNull } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, type WithRequired } from 'utilium';
import { build as buildVite, type InlineConfig } from 'vite';
import config from './config.js';
import { overrideWrite } from './io.js';

const sveltekitPackageJSON = findPackageJSON('@sveltejs/kit', import.meta.url);
if (!sveltekitPackageJSON) exit('Could not resolve @sveltejs/kit package.', 6);
const { process_config: processSvelteConfig } = await import(join(sveltekitPackageJSON, '../src/core/config/index.js'));
const { kit: svelteKitPlugin } = await import(join(sveltekitPackageJSON, '../src/exports/vite/index.js'));

const baseSvelteConfig: WithRequired<SvelteConfig, 'kit'> = {
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			return !w.code.startsWith('a11y') && w.code != 'state_referenced_locally';
		},
		experimental: {
			async: true,
		},
	},
	kit: {
		files: {
			assets: join(fileURLToPath(new URL(import.meta.resolve('@axium/client'))), '../../assets'),
			appTemplate: join(import.meta.dirname, '../template.html'),
			routes: config.web.routes,
			hooks: {
				universal: devNull,
				client: join(import.meta.dirname, '../.hooks.js'),
			},
		},
	},
};

const vitePluginSvelteOptions = {
	configFile: false,
	...pick(baseSvelteConfig, 'extensions', 'preprocess', 'onwarn', 'compilerOptions'),
} satisfies SvelteViteOptions;

const baseViteConfig: WithRequired<InlineConfig, 'build'> = {
	configFile: false,
	appType: 'custom',
	server: {
		strictPort: true,
		port: 443,
	},
	ssr: {
		external: ['@axium/server'],
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

async function createConfig(options: BuildOptions): Promise<WithRequired<InlineConfig, 'build'>> {
	const svelteConfig = processSvelteConfig({
		...baseSvelteConfig,
		kit: {
			...baseSvelteConfig.kit,
			adapter: nodeAdapter(),
		},
	});

	const viteConfig = structuredClone(baseViteConfig);

	const logLevel = options.verbose ? 'info' : 'silent';
	Object.assign(viteConfig, { logLevel, build: pick(options, 'minify') });

	viteConfig.plugins = [...viteSveltePlugin(vitePluginSvelteOptions), ...(await svelteKitPlugin({ svelte_config: svelteConfig }))];

	// SvelteKit uses a nested call to Vite's `build` that fails if we don't have a vite config file
	// We get around that with a sveltekit patch and this "hidden"/internal global
	const __axiumNestedConfig: WithRequired<InlineConfig, 'build'> = {
		configFile: false,
		appType: 'custom',
		plugins: [viteSveltePlugin(vitePluginSvelteOptions), await svelteKitPlugin({ svelte_config: svelteConfig })],
		logLevel,
		build: { minify: options.minify },
	};

	Object.assign(globalThis, { __axiumNestedConfig });

	return viteConfig;
}

function allowWrite(text: string, stack?: string) {
	return (
		!stack?.includes('svelte') &&
		!stack?.includes('vite') &&
		!text.includes('No Svelte config file') &&
		!text.includes('Circular dependency: node_modules')
	);
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

export async function build(options: BuildOptions = {}) {
	using override = overrideWrite(allowWrite, process.stdout, process.stderr);
	if (options.verbose) override.cancel();

	const startTime = performance.now();

	const viteConfig = await createConfig(options);

	try {
		const result = await buildVite(viteConfig);
		let size = 0n;
		const outputs = Array.isArray(result) ? result : [result];
		for (const out of outputs) {
			if (!out || !('output' in out)) continue;
			for (const chunk of out.output) {
				size += BigInt(chunk.type === 'chunk' ? chunk.code.length : chunk.source.length);
			}
		}

		return {
			time: Math.round(performance.now() - startTime),
			size,
		};
	} finally {
		// nothing
	}
}
