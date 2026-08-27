/**
 * @see https://svelte.dev/docs/kit/service-workers
 */
declare module '$service-worker' {
	export const base: string;
	export const build: string[];
	export const files: string[];
	export const prerendered: string[];
	export const version: string;
}
