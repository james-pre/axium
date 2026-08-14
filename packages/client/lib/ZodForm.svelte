<script lang="ts">
	import { type ReplacementOptions, text } from '@axium/client/locales';
	import { zKeys } from '@axium/core/locales';
	import type { ZodObject } from 'zod';
	import ZodInput from './ZodInput.svelte';

	interface Props {
		rootValue: any;
		schema: ZodObject;
		labels?: Record<string, string>;
		updateValue(value: any): void;
		idPrefix?: string;
	}

	let { rootValue = $bindable(), schema, labels, updateValue, idPrefix }: Props = $props();

	const localeInfo = zKeys.get(schema);

	function subText(name: string, replacements?: ReplacementOptions & Record<string, any>): string | undefined {
		if (!localeInfo?.prefix) return replacements?.$default || labels?.[name] || name;
		return text(`${localeInfo.prefix}.${name}`, replacements);
	}
</script>

<div class="ZodForm">
	{#each Object.keys(schema.shape).sort((a, b) => a.localeCompare(b)) as path}
		<ZodInput bind:rootValue {updateValue} {idPrefix} {path} schema={schema.shape[path]} label={subText(path)} />
	{/each}
</div>

<style>
	.ZodForm {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1em;
	}
</style>
