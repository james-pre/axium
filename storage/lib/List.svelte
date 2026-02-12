<script lang="ts">
	import { contextMenu } from '@axium/client/attachments';
	import { AccessControlDialog, FormDialog, Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import type { AccessControllable, UserPublic } from '@axium/core';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { copyShortURL } from '@axium/storage/client/frontend';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import Preview from './Preview.svelte';

	let {
		items = $bindable(),
		appMode,
		emptyText = 'Folder is empty.',
		user,
	}: { appMode?: boolean; items: (StorageItemMetadata & AccessControllable)[]; emptyText?: string; user?: UserPublic } = $props();

	let activeIndex = $state<number>(0);
	const activeItem = $derived(items[activeIndex]);
	const dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string, i: number, preview: boolean = false)}
	<span
		class={['icon-text', !preview ? 'action' : 'preview-action']}
		onclick={() => {
			activeIndex = i;
			dialogs[name].showModal();
		}}
	>
		<Icon i={icon} --size={preview ? '18px' : '14px'} />
	</span>
{/snippet}

{#snippet _itemName()}
	{#if activeItem?.name}
		<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
	{:else}
		this
	{/if}
{/snippet}

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each items as item, i (item.id)}
		<div
			class="list-item"
			onclick={async () => {
				if (item.type != 'inode/directory') {
					activeIndex = i;
					dialogs.preview.showModal();
				} else if (appMode) location.href = '/files/' + item.id;
				else items = await getDirectoryMetadata(item.id);
			}}
			{@attach contextMenu(
				{ i: 'pencil', text: 'Rename', action: () => dialogs.rename.showModal() },
				{ i: 'user-group', text: 'Share', action: () => dialogs['share:' + item.id].showModal() },
				{ i: 'download', text: 'Download', action: () => dialogs.download.showModal() },
				{ i: 'link-horizontal', text: 'Copy Link', action: () => copyShortURL(item) },
				{ i: 'trash', text: 'Trash', action: () => dialogs.trash.showModal() }
			)}
		>
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{item.type == 'inode/directory' ? '—' : formatBytes(item.size)}</span>
			<div
				style:display="contents"
				onclick={e => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}}
			>
				{@render action('rename', 'pencil', i)}
				{@render action('share:' + item.id, 'user-group', i)}
				<AccessControlDialog
					bind:dialog={dialogs['share:' + item.id]}
					{item}
					itemType="storage"
					editable={(item.acl?.find(
						a =>
							a.userId == user?.id ||
							(a.role && user?.roles.includes(a.role)) ||
							(a.tag && user?.tags?.includes(a.tag)) ||
							(!a.userId && !a.role && !a.tag)
					)?.manage as boolean | undefined) ?? true}
				/>
				{@render action('download', 'download', i)}
				{@render action('trash', 'trash', i)}
			</div>
		</div>
	{:else}
		<p class="list-empty">{emptyText}</p>
	{/each}
</div>

<dialog bind:this={dialogs.preview} class="preview">
	{#if activeItem}
		<Preview
			item={activeItem}
			previewDialog={dialogs.preview}
			shareDialog={dialogs['share:' + activeItem.id]}
			onDelete={() => items.splice(activeIndex, 1)}
		/>
	{/if}
</dialog>

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
			/** @todo ZIP support */
			const children = await getDirectoryMetadata(activeItem!.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(activeItem!.dataURL, '_blank');
	}}
>
	<p>Are you sure you want to download {@render _itemName()}?</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(4, 1em);
	}

	dialog.preview {
		inset: 0;
		width: 100%;
		height: 100%;
		background-color: #000a;
		border: none;
		padding: 1em;
		word-wrap: normal;
	}
</style>
