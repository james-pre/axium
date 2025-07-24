<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { FormDialog, Icon } from '@axium/server/lib';
	import { deleteItem, getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
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

<div class="StorageList">
	{#await getDirectoryMetadata(id).then(data => (items = data)) then}
		<div class="StorageListItem header">
			<span></span>
			<span>Name</span>
			<span>Last Modified</span>
			<span>Size</span>
		</div>
		{#each items as item, i (item.id)}
			<div class="StorageListItem">
				<Icon i={iconForMime(item.type)} />
				<span class="name">{item.name}</span>
				<span>{item.modifiedAt.toLocaleString()}</span>
				<span>{formatBytes(item.size)}</span>
				{@render action('rename', 'edit', i)}
				{@render action('download', 'download', i)}
				{@render action('delete', 'delete', i)}
			</div>
		{:else}
			<i>Empty.</i>
		{/each}
	{:catch error}
		<i style:color="#c44">{error.message}</i>
	{/await}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText="Rename"
	submit={async (data: { name: string }) => {
		await updateItemMetadata(activeItem.id, data);
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
	.StorageList {
		display: flex;
		flex-direction: column;
		padding: 0.5em;
	}

	.StorageListItem.header {
		font-weight: bold;
		border-bottom: 1px solid #bbc;
	}

	.StorageListItem {
		display: grid;
		grid-template-columns: 1em 4fr 15em 5em repeat(1em, 3);
		align-items: center;
		gap: 0.5em;
	}

	.StorageListItem:not(:last-child) {
		padding: 0.5em 0;
		border-bottom: 1px solid #bbc;
	}

	.StorageListItem:not(.header):hover {
		background-color: #8888;
	}

	.action {
		visibility: hidden;
	}

	.StorageListItem:hover .action {
		visibility: visible;
	}

	.action:hover {
		cursor: pointer;
	}
</style>
