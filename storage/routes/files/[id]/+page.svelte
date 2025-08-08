<script lang="ts">
	import { Icon } from '@axium/server/components';
	import { StorageList } from '@axium/storage/components';
	import type { PageProps } from './$types';
	import { updateItemMetadata } from '@axium/storage/client';

	const { data }: PageProps = $props();

	const item = $state(data.item);
</script>

<svelte:head>
	<title>Files - Preview - {item.name}</title>
</svelte:head>

{#if item.trashedAt}
	<p>This item is trashed</p>
	<button
		onclick={async e => {
			e.preventDefault();
			await updateItemMetadata(item.id, { trash: false });
		}}
	>
		<Icon i="trash-can-undo" /> Restore
	</button>
{:else if item.type == 'inode/directory'}
	<StorageList appMode bind:items={data.items!} />
{:else}
	<p>No preview available.</p>
{/if}
