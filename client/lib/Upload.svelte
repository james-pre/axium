<script lang="ts">
	import { forMime } from '@axium/core/icons';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	let {
		name = 'files',
		input = $bindable(),
		files = $bindable(),
		progress = $bindable(),
		...rest
	}: HTMLInputAttributes & { input?: HTMLInputElement; progress?: [current: number, max: number][] } = $props();

	const id = $props.id();
</script>

<div>
	<label for={id} class={[files?.length && 'file']}>
		{#each files! as file, i}
			<Icon i={forMime(file.type)} />
			<div class="name">
				<span>{file.name}</span>
				{#if progress?.[i]}
					<progress value={progress[i][0]} max={progress[i][1]}></progress>
				{/if}
			</div>
			<button
				onclick={e => {
					e.preventDefault();
					const dt = new DataTransfer();
					for (let f of files!) if (file !== f) dt.items.add(f);
					input!.files = files = dt.files;
				}}
				style:display="contents"
			>
				<Icon i="trash" />
			</button>
		{:else}
			<Icon i="upload" /> Upload
		{/each}
	</label>

	<input bind:this={input} bind:files {name} {id} type="file" {...rest} />
</div>

<style>
	input {
		display: none;
	}

	label {
		padding: 0.5em 1em;
		border: 1px solid hsl(0 0 calc(var(--fg-light) + var(--light-step)) / 80);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-radius: 0.5em;
		width: 20em;
	}

	.name {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
	}

	progress {
		width: 100%;
		height: 4px;
	}

	label.file {
		display: grid;
		grid-template-columns: 2em 1fr 2em;
	}
</style>
