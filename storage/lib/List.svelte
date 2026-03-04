<script lang="ts">
	import { text } from '@axium/client';
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
	import { copy } from '@axium/client/clipboard';

	let {
		items = $bindable(),
		appMode,
		emptyText = text('storage.List.empty'),
		user,
	}: { appMode?: boolean; items: (StorageItemMetadata & AccessControllable)[]; emptyText?: string; user?: UserPublic } = $props();

	let activeIndex = $state<number>(0);
	const activeItem = $derived(items[activeIndex]);
	const activeItemName = $derived(
		activeItem?.name
			? `<strong>${activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>`
			: 'this'
	);
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

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>{text('storage.generic.name')}</span>
		<span>{text('storage.List.last_modified')}</span>
		<span>{text('storage.List.size')}</span>
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
				{ i: 'pencil', text: text('storage.generic.rename'), action: () => ((activeIndex = i), dialogs.rename.showModal()) },
				{
					i: 'user-group',
					text: text('storage.List.share'),
					action: () => ((activeIndex = i), dialogs['share:' + item.id].showModal()),
				},
				{ i: 'download', text: text('storage.generic.download'), action: () => ((activeIndex = i), dialogs.download.showModal()) },
				{ i: 'link-horizontal', text: text('storage.List.copy_link'), action: () => ((activeIndex = i), copyShortURL(item)) },
				{ i: 'trash', text: text('storage.generic.trash'), action: () => ((activeIndex = i), dialogs.trash.showModal()) },
				user?.preferences?.debug && {
					i: 'hashtag',
					text: text('storage.generic.copy_id'),
					action: () => copy('text/plain', item.id),
				}
			)}
		>
			<dfn class="type" title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span class="modified mobile-subtle">{item.modifiedAt.toLocaleString()}</span>
			<span class={['size', item.type != 'inode/directory' && 'file-size', 'mobile-subtle']}
				>{item.type == 'inode/directory' ? '—' : formatBytes(item.size)}</span
			>
			<div
				class="item-actions"
				onclick={e => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}}
			>
				{@render action('rename', 'pencil', i)}
				{@render action('share:' + item.id, 'user-group', i)}
				{@render action('download', 'download', i)}
				{@render action('trash', 'trash', i)}
			</div>
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
	submitText={text('storage.generic.rename')}
	submit={async (data: { name: string }) => {
		if (!activeItem) throw text('storage.generic.no_item');
		await updateItemMetadata(activeItem.id, data);
		activeItem.name = data.name;
	}}
>
	<div>
		<label for="name">{text('storage.generic.name')}</label>
		<input name="name" type="text" required value={activeItem?.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.trash}
	submitText={text('storage.generic.trash')}
	submitDanger
	submit={async () => {
		if (!activeItem) throw text('storage.generic.no_item');
		await updateItemMetadata(activeItem.id, { trash: true });
		items.splice(activeIndex, 1);
	}}
>
	<p>{@html text('storage.List.trash_confirm', { $html: true, name: activeItemName })}</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText={text('storage.generic.download')}
	submit={async () => {
		if (activeItem!.type == 'inode/directory') {
			/** @todo ZIP support */
			const children = await getDirectoryMetadata(activeItem!.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(activeItem!.dataURL, '_blank');
	}}
>
	<p>{@html text('storage.generic.download_confirm', { $html: true, name: activeItemName })}</p>
</FormDialog>

<style>
	.item-actions {
		display: contents;
	}

	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(4, 1em);
	}

	@media (width < 700px) {
		.item-actions {
			display: none;
		}

		.list-item {
			grid-template-columns: 1em 2fr 1fr;
			row-gap: 0.25em;

			.modified {
				grid-row: 2;
				grid-column: 2;
			}

			.size {
				grid-row: 2;
				grid-column: 3;
				text-align: right;

				&:not(.file-size) {
					display: none;
				}
			}
		}
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
