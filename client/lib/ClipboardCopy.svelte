<script lang="ts">
	import { fade } from 'svelte/transition';
	import { wait } from 'utilium';
	import Icon from './Icon.svelte';
	import * as clip from '@axium/client/clipboard';

	const { value, type = 'text/plain' }: { value: BlobPart; type?: string } = $props();

	let success = $state(false);

	async function onclick() {
		await clip.copy(type, value);
		success = true;
		await wait(3000);
		success = false;
	}
</script>

<button {onclick}>
	{#if success}
		<span transition:fade><Icon i="check" /></span>
	{:else}
		<span transition:fade><Icon i="copy" /></span>
	{/if}
</button>

<style>
	button {
		position: relative;
		display: inline-block;
		width: 1em;
		height: 1em;
		border: none;
		background: transparent;
	}

	span {
		position: absolute;
		inset: 0;
	}
</style>
