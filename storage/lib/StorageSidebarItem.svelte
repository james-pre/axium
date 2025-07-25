<script lang="ts">
	import * as icon from '@axium/core/icons';
	import { ClipboardCopy, FormDialog, Icon } from '@axium/server/lib';
	import { deleteItem, updateItem, type _Sidebar } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import { getContext } from 'svelte';
	import StorageSidebarItem from './StorageSidebarItem.svelte';

	let {
		item = $bindable(),
		items = $bindable(),
		debug = false,
	}: {
		item: StorageItemMetadata;
		/** The items list for the parent directory */
		items: StorageItemMetadata[];
		debug?: boolean;
	} = $props();

	const sb = getContext<() => _Sidebar>('files:sidebar')();

	const dialogs = $state<Record<string, HTMLDialogElement>>({});
	let popover = $state<HTMLDivElement>();

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		popover?.togglePopover();
	}

	function onclick(e: MouseEvent) {
		if (e.shiftKey) sb.selection.toggleRange(item.id);
		else if (e.ctrlKey) sb.selection.toggle(item.id);
		else {
			sb.selection.clear();
			sb.selection.add(item.id);
		}
	}

	let children = $state<StorageItemMetadata[]>([]);
</script>

{#snippet action(name: string, i: string, text: string)}
	<div
		onclick={e => {
			e.stopPropagation();
			e.preventDefault();
			dialogs[name].showModal();
		}}
	>
		<Icon {i} --size="14px" />
		{text}
	</div>
{/snippet}

{#snippet _itemName()}
	{#if item.name}
		<strong>{item.name.length > 23 ? item.name.slice(0, 20) + '...' : item.name}</strong>
	{:else}
		this
	{/if}
{/snippet}

{#if item.type == 'inode/directory'}
	<details>
		<summary class={['StorageSidebarItem', sb.selection.has(item.id) && 'selected']} {onclick} {oncontextmenu}>
			<Icon i={icon.forMime(item.type)} />
			<span class="name">{item.name}</span>
		</summary>
		<div>
			{#await sb.getDirectory(item.id, children)}
				<i>Loading...</i>
			{:then}
				{#each children as _, i (_.id)}
					<StorageSidebarItem bind:item={children[i]} bind:items={children} />
				{/each}
			{:catch error}
				<i style:color="#c44">{error.message}</i>
			{/await}
		</div>
	</details>
{:else}
	<div class={['StorageSidebarItem', sb.selection.has(item.id) && 'selected']} {onclick} {oncontextmenu}>
		<Icon i={icon.forMime(item.type)} />
		<span class="name">{item.name}</span>
	</div>
{/if}

<div popover bind:this={popover}>
	{@render action('rename', 'pen', 'Rename')}
	{@render action('delete', 'trash', 'Delete')}
	{#if item.type == 'cas_item'}
		{@render action('download', 'download', 'Download')}
	{/if}
	{#if debug}
		<ClipboardCopy value={item.id} />
	{/if}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText="Rename"
	submit={async (data: { name: string }) => {
		await updateItem(item.id, data);
		item.name = data.name;
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required value={item.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.delete}
	submitText="Delete"
	submitDanger
	submit={async () => {
		await deleteItem(item.id);
		const index = items.findIndex(r => r.id === item.id);
		if (index !== -1) items.splice(index, 1);
	}}
>
	<p>Are you sure you want to delete {@render _itemName()}?</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText="Download"
	submit={async () => {
		open(item.dataURL, '_blank');
	}}
>
	<p>
		We are not responsible for the contents of this file. <br />
		Are you sure you want to download {@render _itemName()}?
	</p>
</FormDialog>

<style>
	.StorageSidebarItem {
		display: grid;
		grid-template-columns: 1em 1fr;
		align-items: center;
		text-align: left;
		gap: 0.5em;
		border-radius: 0.5em;
		border: 1px solid transparent;
		padding: 0.25em 0.75em 0.25em 0.5em;
		font-size: 14px;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.StorageSidebarItem:hover {
		background: #334;
		cursor: pointer;
	}

	.selected {
		border: 1px solid #555;
		background: #334;
		color: #fff;
	}

	details > div {
		padding-left: 0.5em;
	}
</style>
