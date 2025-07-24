<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { FormDialog, Icon } from '@axium/server/lib';
	import { deleteItem, getDirectoryMetadata, updateItem } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';

	const { id }: { id: string } = $props();

	let items = $state<StorageItemMetadata[]>([]);
	let activeIndex = $state<number>(-1);
	let activeItem = $derived(items[activeIndex]);
	const dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string, i: number)}
	<Icon
		i={icon}
		--size="14px"
		onclick={(e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			activeIndex = i;
			dialogs[name].showModal();
		}}
		class="action"
	/>
{/snippet}

{#snippet _itemName()}
	{#if activeItem.name}
		<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
	{:else}
		this
	{/if}
{/snippet}

<div class="FilesList">
	{#await getDirectoryMetadata(id).then(data => (items = data)) then}
		{#each items as item, i (item.id)}
			<div class="FilesListItem">
				<Icon i={iconForMime(item.type)} />
				<span class="name">{item.name}</span>
				<span>{item.modifiedAt.toLocaleString()}</span>
				<span>{formatBytes(item.size)}</span>
				{@render action('rename', 'edit', i)}
				{@render action('download', 'download', i)}
				{@render action('delete', 'delete', i)}
			</div>
		{:else}
			<i>No items.</i>
		{/each}
	{:catch error}
		<i style:color="#c44">{error.message}</i>
	{/await}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText="Rename"
	submit={async (data: { name: string }) => {
		await updateItem(activeItem.id, data);
		activeItem.name = data.name;
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required value={activeItem.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.delete}
	submitText="Delete"
	submitDanger
	submit={async () => {
		await deleteItem(activeItem.id);
		if (activeIndex != -1) items.splice(activeIndex, 1);
	}}
>
	<p>Are you sure you want to delete {@render _itemName()}?</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText="Download"
	submit={async () => {
		open(activeItem.dataURL, '_blank');
	}}
>
	<p>
		We are not responsible for the contents of this file. <br />
		Are you sure you want to download {@render _itemName()}?
	</p>
</FormDialog>

<style>
	.FilesList {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		padding: 0.5em;
	}

	.FilesListItem {
		display: grid;
		grid-template-columns: 1em 4fr 15em 5em repeat(1em, 3);
		align-items: center;
		gap: 0.5em;
	}

	.action {
		visibility: hidden;
	}

	.FilesListItem:hover .action {
		visibility: visible;
	}

	.action:hover {
		cursor: pointer;
	}
</style>
