<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AppMetadata } from '@axium/core';

	const { apps }: { apps: AppMetadata[] } = $props();
</script>

<button style:display="contents" popovertarget="AppMenu">
	<Icon i="grid" --size="2em" />
</button>

<div id="AppMenu" popover>
	{#each apps as app}
		<div class="AppMenu-item">
			{#if app.image}
				<img src={app.image} alt={app.name} />
			{:else if app.icon}
				<Icon i={app.icon} --size="2em" />
			{:else}
				<Icon i="image-circle-xmark" --size="2em" />
			{/if}
		</div>
	{:else}
		<i>No apps available.</i>
	{/each}
</div>

<style>
	#AppMenu {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
		background-color: #111;
		border: 1px solid #112;
		border-radius: 0.5em;
	}

	.AppMenu-item {
		display: grid;
		grid-template-columns: 2em 1fr;
		gap: 1em;
		padding: 0.5em 1em;
	}

	.AppMenu-item:hover {
		background-color: #223;
	}

	.AppMenu-item:not(:last-child) {
		border-bottom: 1px solid #222;
	}
</style>
