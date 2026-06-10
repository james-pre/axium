<script lang="ts">
	import { text } from '@axium/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import SidebarItem from './SidebarItem.svelte';
	import { items as sb_items, getDirectory } from '@axium/storage/sidebar';

	let { root }: { root: string | StorageItemMetadata[] } = $props();

	let items = $state<StorageItemMetadata[]>([]);

	if (typeof root != 'string') {
		sb_items.push(...root);
		items = root;
	}
</script>

<div id="StorageSidebar">
	{#await typeof root == 'string' ? getDirectory(root, items) : root}
		<i>{text('generic.loading')}</i>
	{:then}
		{#each items as _, i (_.id)}
			<SidebarItem bind:item={items[i]} bind:items />
		{:else}
			<i>{text('storage.Sidebar.no_files')}</i>
		{/each}
	{:catch error}
		<i class="error-text">{error.message}</i>
	{/await}
</div>

<style>
</style>
