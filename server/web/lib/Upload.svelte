<script lang="ts">
	import { forMime } from '@axium/core/icons';
	import Icon from './Icon.svelte';

	let { files = $bindable(), name = 'files', ...rest }: { files?: FileList; name?: string; multiple?: any; required?: any } = $props();

	let input = $state<HTMLInputElement>();

	const id = 'input:' + Math.random().toString(36).slice(2);
</script>

<div>
	<label for={id} class={[files?.length && 'file']}>
		{#each files as file}
			<Icon i={forMime(file.type)} />
			<span>{file.name}</span>
			<button
				onclick={e => {
					e.preventDefault();
					const dt = new DataTransfer();
					for (let f of files) if (file !== f) dt.items.add(f);
					input.files = files = dt.files;
				}}
				style:display="contents"
			>
				<Icon i="trash" />
			</button>
		{:else}
			<Icon i="upload" /> Upload
		{/each}
	</label>

	<input bind:this={input} {name} {id} type="file" bind:files {...rest} />
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
