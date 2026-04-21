<script lang="ts">
	import { text } from '@axium/client';
	import { closeOnBackGesture, contextMenu } from '@axium/client/attachments';
	import { AccessControlDialog, FormDialog, Icon } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import '@axium/client/styles/list';
	import { toastStatus } from '@axium/client/toast';
	import type { AccessControllable, UserPublic } from '@axium/core';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { _downloadItem, copyShortURL } from '@axium/storage/client/frontend';
	import { StorageItemSorting, type StorageItemMetadata } from '@axium/storage/common';
	import { errorText } from 'ioium';
	import Preview from './Preview.svelte';

	let {
		items = $bindable(),
		appMode,
		emptyText = text('storage.List.empty'),
		user,
	}: { appMode?: boolean; items: (StorageItemMetadata & AccessControllable)[]; emptyText?: string; user?: UserPublic } = $props();

	let activeId = $state<string>();
	const activeItem = $derived(items.find(item => item.id === activeId));
	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	const search = new URLSearchParams(location.search);
	let sort = $state<StorageItemSorting | null>();
	try {
		sort = StorageItemSorting.parse({
			by: search.get('sortBy'),
			descending: search.has('descending'),
		});
	} catch (e) {
		console.log('Ignoring invalid sorting parameters', errorText(e));
	}

	const sortedItems = $derived(
		items.toSorted(
			sort
				? (_a, _b) => {
						const [a, b] = sort?.descending ? [_b, _a] : [_a, _b];
						// @ts-expect-error 2362 — `Date`s have a `valueOf` and can be treated like numbers
						return sort.by == 'name' ? a.name.localeCompare(b.name) : a[sort.by] - b[sort.by];
					}
				: undefined
		)
	);

	function removeActiveItem() {
		const index = items.findIndex(item => item.id === activeId);
		if (index == -1) return console.warn('Can not remove active item because it does not exist');
		items.splice(index, 1);
		activeId = undefined;
		dialogs.preview.close();
	}
</script>

{#snippet action(name: string, icon: string, id: string)}
	<span
		class="icon-text action"
		onclick={() => {
			activeId = id;
			dialogs[name].showModal();
		}}
	>
		<Icon i={icon} --size="14px" />
	</span>
{/snippet}

<div class="list">
	<div class="list-item list-header">
		<span></span>
		{#each [['name', 'storage.generic.name'], ['modifiedAt', 'storage.List.last_modified'], ['size', 'storage.List.size']] as const as [key, translation]}
			<span
				class="header-column"
				onclick={() => (sort = sort?.descending === false ? null : { by: key, descending: !sort?.descending })}
			>
				{#if sort?.by == key}
					<Icon i="sort-{sort.descending ? 'down' : 'up'}" />
				{/if}
				<span>{text(translation)}</span>
			</span>
		{/each}
	</div>
	{#each sortedItems as item (item.id)}
		{@const trash = () => {
			activeId = item.id;
			toastStatus(updateItemMetadata(activeId, { trash: true }).then(removeActiveItem), text('storage.generic.trash_success'));
		}}
		<div
			class="list-item"
			onclick={async () => {
				if (item.type != 'inode/directory') {
					activeId = item.id;
					dialogs.preview.showModal();
				} else if (appMode) location.href = '/files/' + item.id;
				else items = await getDirectoryMetadata(item.id);
			}}
			{@attach contextMenu(
				{ i: 'pencil', text: text('storage.generic.rename'), action: () => ((activeId = item.id), dialogs.rename.showModal()) },
				{
					i: 'user-group',
					text: text('storage.List.share'),
					action: () => ((activeId = item.id), dialogs['share:' + item.id].showModal()),
				},
				{ i: 'download', text: text('storage.generic.download'), action: () => _downloadItem(item) },
				{ i: 'link-horizontal', text: text('storage.List.copy_link'), action: () => ((activeId = item.id), copyShortURL(item)) },
				{ i: 'trash', text: text('storage.generic.trash'), action: trash },
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
				{@render action('rename', 'pencil', item.id)}
				{@render action('share:' + item.id, 'user-group', item.id)}
				<span class="icon-text action" onclick={() => _downloadItem(item)}>
					<Icon i="download" --size="14px" />
				</span>
				<span class="icon-text action" onclick={trash}>
					<Icon i="trash" --size="14px" />
				</span>
			</div>
			<AccessControlDialog bind:dialog={dialogs['share:' + item.id]} {item} itemType="storage" {user} />
		</div>
	{:else}
		<p class="list-empty">{emptyText}</p>
	{/each}
</div>

<dialog
	bind:this={dialogs.preview}
	class="preview"
	onclick={e => e.stopPropagation()}
	onclose={() => (activeId = undefined)}
	{@attach closeOnBackGesture}
>
	{#if activeItem}
		<Preview item={activeItem} previewDialog={dialogs.preview} shareDialog={dialogs['share:' + activeId]} onDelete={removeActiveItem} />
	{/if}
</dialog>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText={text('storage.generic.rename')}
	submit={async (data: { name: string }) => {
		if (!activeId || !activeItem) throw text('storage.generic.no_item');
		await updateItemMetadata(activeId, data);
		activeItem.name = data.name;
	}}
>
	<div>
		<label for="name">{text('storage.generic.name')}</label>
		<input name="name" type="text" required value={activeItem?.name} />
	</div>
</FormDialog>

<style>
	.item-actions {
		display: contents;
	}

	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(4, 1em);
	}

	.header-column {
		display: inline-flex;
		align-items: center;

		&:hover {
			cursor: pointer;
		}
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
