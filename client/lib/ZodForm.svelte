<script lang="ts">
	import type { ZodObject } from 'zod';
	import ZodInput from './ZodInput.svelte';

	interface Props {
		rootValue: any;
		schema: ZodObject;
		labels: Record<string, string>;
		updateValue(value: any): void;
	}

	let { rootValue = $bindable(), schema, labels, updateValue }: Props = $props();
	const id = $props.id();
</script>

{#each Object.keys(schema.shape) as path}
	<ZodInput bind:rootValue {updateValue} {path} schema={schema.shape[path]} label={labels[path] || path} />
{/each}
