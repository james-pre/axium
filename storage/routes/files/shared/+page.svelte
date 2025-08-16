<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { Icon } from '@axium/client/components';
	import '@axium/storage/styles/list';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Files - Shared With You</title>
</svelte:head>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each data.items as item, i (item.id)}
		<div class="list-item">
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{formatBytes(item.size)}</span>
		</div>
	{:else}
		<p class="list-empty">No items have been shared with you.</p>
	{/each}
</div>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em !important;
	}
</style>
