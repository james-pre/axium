<script lang="ts">
	import { getDirectoryMetadata, type _Sidebar } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import { setContext } from 'svelte';
	import { ItemSelection } from '../src/selection.js';
	import StorageSidebarItem from './StorageSidebarItem.svelte';

	const { root }: { root: string } = $props();

	let items = $state<StorageItemMetadata[]>([]);

	const allItems: StorageItemMetadata[] = [];

	const sidebar = $state<_Sidebar>({
		selection: new ItemSelection(allItems),
		items: allItems,
		async getDirectory(id: string, assignTo?: StorageItemMetadata[]) {
			const data = await getDirectoryMetadata(id);
			this.items.push(...data);
			assignTo = data;
			return data;
		},
	});

	setContext('files:sidebar', () => sidebar);
</script>

<div id="FilesSidebar">
	{#await sidebar.getDirectory(root, items)}
		<i>Loading...</i>
	{:then}
		{#each items as _, i (_.id)}
			<StorageSidebarItem bind:item={items[i]} bind:items />
		{/each}
	{:catch error}
		<i style:color="#c44">{error.message}</i>
	{/await}
</div>

<style>
</style>
