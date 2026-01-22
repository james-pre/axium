<script lang="ts">
	import type { ZodObject } from 'zod';
	import ZodInput from './ZodInput.svelte';

	interface Props {
		rootValue: any;
		schema: ZodObject;
		labels: Record<string, string>;
		updateValue(value: any): void;
		idPrefix?: string;
	}

	let { rootValue = $bindable(), schema, labels, updateValue, idPrefix }: Props = $props();
</script>

<div class="ZodForm">
	{#each Object.keys(schema.shape).sort((a, b) => a.localeCompare(b)) as path}
		<ZodInput bind:rootValue {updateValue} {idPrefix} {path} schema={schema.shape[path]} label={labels[path] || path} />
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
