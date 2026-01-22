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
	<div class="zod-input">
		<label for={id}>{labels[path]}</label>
		<ZodInput bind:rootValue {updateValue} {path} schema={schema.shape[path]} />
	</div>
{/each}

<style>
	.zod-input {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1em;
	}
</style>
