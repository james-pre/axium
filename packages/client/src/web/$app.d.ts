/**
 * @see https://svelte.dev/docs/kit/$app-manifest
 */
declare module '$app/manifest' {
	export const immutable: Array<{ path: string }>;
	export const assets: Array<{ path: string }>;
	export const prerendered: Array<{ path: string }>;
}

/**
 * @see https://svelte.dev/docs/kit/$app-env
 */
declare module '$app/env' {
	export const version: string;
}

/**
 * @see https://svelte.dev/docs/kit/$app-paths
 */
declare module '$app/paths' {
	export function asset(file: string): string;
	export function resolve(pathname: string): string;
}
