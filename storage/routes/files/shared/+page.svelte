<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { Icon } from '@axium/server/components';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Files - Shared With You</title>
</svelte:head>

<div class="SharedItemList">
	<div class="SharedItem list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each data.items as item, i (item.id)}
		<div class="SharedItem">
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{formatBytes(item.size)}</span>
		</div>
	{:else}
		<i>Empty.</i>
	{/each}
</div>

<style>
	.SharedItemList {
		display: flex;
		flex-direction: column;
		padding: 0.5em;
	}

	.SharedItem.list-header {
		font-weight: bold;
		border-bottom: 1px solid #bbc;
	}

	.SharedItem {
		display: grid;
		grid-template-columns: 1em 4fr 15em 5em;
		align-items: center;
		gap: 0.5em;
		padding: 0.5em 0;
	}

	.SharedItem:not(:last-child) {
		border-bottom: 1px solid #bbc;
	}

	.SharedItem:not(.list-header):hover {
		background-color: #7777;
	}

	.action {
		visibility: hidden;
	}

	.SharedItem:hover .action {
		visibility: visible;
	}

	.action:hover {
		cursor: pointer;
	}
</style>
