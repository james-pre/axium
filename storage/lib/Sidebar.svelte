<script lang="ts">
	import SidebarItem from './SidebarItem.svelte';
	import { getDirectoryMetadata } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';

	const { root }: { root: string } = $props();

	let items = $state<StorageItemMetadata[]>([]);
</script>

<div id="FilesSidebar">
	{#await getDirectoryMetadata(root).then(data => (items = data))}
		<i>Loading...</i>
	{:then}
		{#each items as _, i (_.id)}
			<SidebarItem bind:item={items[i]} bind:items />
		{/each}
	{:catch error}
		<i style:color="#c44">{error.message}</i>
	{/await}
</div>

<style>
</style>
