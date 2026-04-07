import nodeAdapter from '@sveltejs/adapter-node';
import type { Config as SvelteConfig } from '@sveltejs/kit';
import { svelte as viteSveltePlugin, type Options as SvelteViteOptions } from '@sveltejs/vite-plugin-svelte';
import { exit } from 'ioium/node';
import { findPackageJSON } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildVite, type InlineConfig } from 'vite';
import config from './config.js';
import { pick } from 'utilium';

const sveltekitPackageJSON = findPackageJSON('@sveltejs/kit', import.meta.url);
if (!sveltekitPackageJSON) exit('Could not resolve @sveltejs/kit package.', 6);
const { process_config: processSvelteConfig } = await import(join(sveltekitPackageJSON, '../src/core/config/index.js'));
const { kit: svelteKitPlugin } = await import(join(sveltekitPackageJSON, '../src/exports/vite/index.js'));

const svelteConfig: SvelteConfig = processSvelteConfig({
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			return !w.code.startsWith('a11y');
		},
		experimental: {
			async: true,
		},
	},
	kit: {
		adapter: nodeAdapter(),
		files: {
			assets: join(fileURLToPath(new URL(import.meta.resolve('@axium/client'))), '../../assets'),
			appTemplate: join(import.meta.dirname, '../template.html'),
			routes: config.web.routes,
			hooks: {
				universal: '/dev/null',
				client: join(import.meta.dirname, '../.hooks.js'),
			},
		},
	},
} satisfies SvelteConfig);

const vitePluginSvelteOptions = {
	configFile: false,
	...pick(svelteConfig, 'extensions', 'preprocess', 'onwarn', 'compilerOptions'),
} satisfies SvelteViteOptions;

const otherConfig: InlineConfig = {
	configFile: false,
	appType: 'custom',
	server: {
		strictPort: true,
		port: 443,
	},
	plugins: [
		...viteSveltePlugin(vitePluginSvelteOptions),
		...(await svelteKitPlugin({ svelte_config: svelteConfig })) /*, mkcert({ hosts: ['cloud.jamespre.dev'] }) */,
	],
	ssr: {
		external: ['@axium/server', '@axium/storage/server', '@axium/storage/plugin'],
	},
	optimizeDeps: {
		exclude: ['@axium/storage/sidebar'],
		include: ['@axium/client/components', '@axium/storage/components'],
	},
	build: {
		rollupOptions: {
			external: [/^@axium\/server(?!\/components)/],
		},
		cssMinify: false,
	},
	logLevel: 'silent',
};

// SvelteKit uses a nested call to Vite's `build` that fails if we don't have a vite config file
// We get around that with a sveltekit patch and this "hidden"/internal global
const __axiumNestedConfig: InlineConfig = {
	configFile: false,
	appType: 'custom',
	plugins: [viteSveltePlugin(vitePluginSvelteOptions), await svelteKitPlugin({ svelte_config: svelteConfig })],
	logLevel: 'silent',
};

Object.assign(globalThis, { __axiumNestedConfig });

function write(chunk: string | Uint8Array, encoding?: BufferEncoding | Function, cb?: Function): boolean {
	if (typeof encoding === 'function') cb = encoding;
	if (cb) cb();
	return true;
}

export interface BuildOptions {
	/**
	 * If set all of the output from Vite and Svelte/SvelteKit will be shown.
	 * This is usually undesirable.
	 */
	showGarbageOutput?: boolean;
}

export interface BuildStats {
	/** Build time in milliseconds */
	time: number;
	/** Bundle size in bytes */
	size: bigint;
}

export async function build(options: BuildOptions = {}) {
	const stdoutWrite = process.stdout.write.bind(process.stdout);
	const stderrWrite = process.stderr.write.bind(process.stderr);

	const startTime = performance.now();

	if (options.showGarbageOutput) {
		otherConfig.logLevel = 'info';
		__axiumNestedConfig.logLevel = 'info';
	} else {
		Object.assign(process.stdout, { write });
		Object.assign(process.stderr, { write });
	}

	try {
		const result = await buildVite(otherConfig);
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
		if (!options.showGarbageOutput) {
			process.stdout.write = stdoutWrite;
			process.stderr.write = stderrWrite;
		}
	}
}
