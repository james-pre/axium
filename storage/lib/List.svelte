<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { FormDialog, Icon } from '@axium/server/components';
	import { getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import '../styles/list.css';

	let {
		items = $bindable([]),
		appMode,
		emptyText = 'Folder is empty.',
	}: { appMode?: boolean; items: StorageItemMetadata[]; emptyText?: string } = $props();

	let activeIndex = $state<number>(-1);
	let activeItem = $derived(activeIndex == -1 ? null : items[activeIndex]);
	const dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string, i: number)}
	<span
		class="action"
		onclick={(e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			activeIndex = i;
			dialogs[name].showModal();
		}}
	>
		<Icon i={icon} --size="14px" />
	</span>
{/snippet}

{#snippet _itemName()}
	{#if activeItem?.name}
		<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
	{:else}
		this
	{/if}
{/snippet}

{#snippet _item(item: StorageItemMetadata, i: number)}
	<div class="list-item">
		<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
		<span class="name">{item.name}</span>
		<span>{item.modifiedAt.toLocaleString()}</span>
		<span>{item.type == 'inode/directory' ? '—' : formatBytes(item.size)}</span>
		{@render action('rename', 'pencil', i)}
		{@render action('download', 'download', i)}
		{@render action('trash', 'trash', i)}
	</div>
{/snippet}

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each items as item, i (item.id)}
		{#if item.type == 'inode/directory' && appMode}
			<a class="list-item-container" href="/files/{item.id}">{@render _item(item, i)}</a>
		{:else}
			{@render _item(item, i)}
		{/if}
	{:else}
		<p class="list-empty">{emptyText}</p>
	{/each}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText="Rename"
	submit={async (data: { name: string }) => {
		if (!activeItem) throw 'No item is selected';
		await updateItemMetadata(activeItem.id, data);
		activeItem.name = data.name;
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required value={activeItem?.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.trash}
	submitText="Trash"
	submitDanger
	submit={async () => {
		if (!activeItem) throw 'No item is selected';
		await updateItemMetadata(activeItem.id, { trash: true });
		items.splice(activeIndex, 1);
	}}
>
	<p>Are you sure you want to trash {@render _itemName()}?</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText="Download"
	submit={async () => {
		if (activeItem!.type == 'inode/directory') {
			const children = await getDirectoryMetadata(activeItem!.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(activeItem!.dataURL, '_blank');
	}}
>
	<p>
		We are not responsible for the contents of this {activeItem?.type == 'inode/directory' ? 'folder' : 'file'}. <br />
		Are you sure you want to download {@render _itemName()}?
	</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(3, 1em);
	}
</style>
