<script lang="ts">
	import { forMime } from '@axium/core/icons';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	let { name = 'files', ...rest }: HTMLInputAttributes = $props();

	let input = $state<HTMLInputElement>()!;

	const id = $props.id();
</script>

<div>
	<label for={id} class={[input.files?.length && 'file']}>
		{#each input.files! as file}
			<Icon i={forMime(file.type)} />
			<span>{file.name}</span>
			<button
				onclick={e => {
					e.preventDefault();
					const dt = new DataTransfer();
					for (let f of input.files!) if (file !== f) dt.items.add(f);
					input.files = dt.files;
				}}
				style:display="contents"
			>
				<Icon i="trash" />
			</button>
		{:else}
			<Icon i="upload" /> Upload
		{/each}
	</label>

	<input bind:this={input} {name} {id} type="file" {...rest} />
</div>

<style>
	input {
		display: none;
	}

	label {
		padding: 0.5em 1em;
		border: 1px solid #cccc;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-radius: 0.5em;
		width: 20em;
	}

	label.file {
		display: grid;
		grid-template-columns: 2em 1fr 2em;
	}
</style>
