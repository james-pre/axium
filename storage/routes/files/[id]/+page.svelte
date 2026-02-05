<script lang="ts">
	import { Icon } from '@axium/client/components';
	import { StorageAdd, StorageList } from '@axium/storage/components';
	import type { PageProps } from './$types';
	import { updateItemMetadata } from '@axium/storage/client';

	const { data }: PageProps = $props();

	let items = $state(data.items!);
	const item = $state(data.item);
</script>

<svelte:head>
	<title>Files — {item.name}</title>
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
	<button
		class="icon-text"
		onclick={e => {
			e.preventDefault();
			location.href = '/files' + (item.parentId ? '/' + item.parentId : '');
		}}
	>
		<Icon i="folder-arrow-up" /> Back
	</button>
	<StorageList appMode bind:items user={data.session?.user} />
	<StorageAdd parentId={item.id} onAdd={item => items.push(item)} />
{:else}
	<p>No preview available.</p>
{/if}
