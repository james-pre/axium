<script lang="ts">
	import { preferences, text } from '@axium/client';
	import { closeOnBackGesture, contextMenu, drag, selectable, selectionControls, Selection } from '@axium/client/attachments';
	import { SyncedClipboard } from '@axium/client/reactive';
	import { AccessControlDialog, Icon } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import '@axium/client/styles/list';
	import { toast, toastStatus } from '@axium/client/toast';
	import type { AccessControllable, UserPublic } from '@axium/core';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { getDirectoryMetadata, getUserStorageRoot, updateItemMetadata } from '@axium/storage/client';
	import { _downloadItem, _downloadItems, copyShortURL, moveItems } from '@axium/storage/client/frontend';
	import { StorageItemSorting, StoragePreferences, type StorageItemMetadata } from '@axium/storage/common';
	import { pick } from 'utilium';
	import Path from './Path.svelte';
	import Preview from './Preview.svelte';

	const search = new URLSearchParams(location.search);

	let {
		items = $bindable(),
		appMode,
		special,
		emptyText = text('storage.List.empty'),
		folderId = null,
		user,
		sort = $bindable<StorageItemSorting | undefined>(
			StorageItemSorting.safeParse({
				by: search.get('sortBy'),
				descending: search.has('descending'),
			}).data
		),
	}: {
		appMode?: boolean;
		special?: boolean;
		items: (StorageItemMetadata & AccessControllable)[];
		emptyText?: string;
		folderId?: string | null;
		user?: UserPublic;
		sort?: StorageItemSorting;
	} = $props();

	/** The item currently being previewed. */
	let activeId = $state<string>();
	const activeItem = $derived(items.find(item => item.id === activeId));
	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	/** The item whose name is currently being edited inline, and the draft value. */
	let editingId = $state<string>(),
		editingName = $state('');

	function startRename(item: StorageItemMetadata) {
		editingId = item.id;
		editingName = item.name;
	}

	function commitRename(item: StorageItemMetadata) {
		const name = editingName?.trim();
		editingId = undefined;
		if (!name || name == item.name) return;
		toastStatus(
			updateItemMetadata(item.id, { name }).then(() => (item.name = name)),
			text('storage.generic.rename_success')
		);
	}

	const clipboard = new SyncedClipboard<string>('storage.clipboard');

	const selection = new Selection([
		{
			key: 'F2',
			action(sel) {
				if (sel.size != 1) return;
				const item = items.find(i => i.id === sel.values().next().value);
				if (item) startRename(item);
			},
		},
		{
			key: 'a',
			ctrl: true,
			action() {
				for (const item of sortedItems) selection.add(item.id);
			},
		},
		{
			key: 'x',
			ctrl: true,
			action(sel) {
				if (sel.size) clipboard.cut(sel);
			},
		},
		{
			key: 'c',
			ctrl: true,
			action(sel) {
				if (sel.size) toast('warning', text('storage.List.copy_unsupported'));
			},
		},
		{
			key: 'v',
			ctrl: true,
			action() {
				if (clipboard.isCopy || !clipboard.size) return;

				// Pasting into the folder the items already live in is a no-op.
				const ids = [...clipboard].filter(id => !items.some(item => item.id == id && item.parentId == folderId));
				clipboard.clear();
				if (!ids.length) return;

				toastStatus(
					moveItems(ids, folderId).then(async () => {
						// Reload this folder so the pasted items appear.
						if (folderId) items = await getDirectoryMetadata(folderId);
						else if (user) items = await getUserStorageRoot(user.id);
					}),
					text('storage.generic.move_success')
				);
			},
		},
	]);

	const { sort_folders_first, full_path_in_special, open_with_single_click } = user
		? await preferences.get(user.id, 'files')
		: StoragePreferences.safeParse({}).data || {};

	const sortedItems = $derived(
		items.toSorted((_a, _b) => {
			if (!sort) {
				const dirDiff = +(_b.type == 'inode/directory') - +(_a.type == 'inode/directory');
				if (sort_folders_first && dirDiff) return dirDiff;
				return _a.name.localeCompare(_b.name);
			}

			const [a, b] = sort.descending ? [_b, _a] : [_a, _b];
			// @ts-expect-error 2362 — `Date`s have a `valueOf` and can be treated like numbers
			return sort.by == 'name' ? a.name.localeCompare(b.name) : Number(a[sort.by] - b[sort.by]);
		})
	);

	$effect(() => selection.setOrder(sortedItems.map(item => item.id)));

	function openItem(item: StorageItemMetadata) {
		if (item.type != 'inode/directory') {
			activeId = item.id;
			dialogs.preview.showModal();
		} else if (appMode) location.href = '/files/' + item.id;
		else getDirectoryMetadata(item.id).then(result => (items = result));
	}

	function removeActiveItem() {
		const index = items.findIndex(item => item.id === activeId);
		if (index == -1) return console.warn('Can not remove active item because it does not exist');
		items.splice(index, 1);
		selection.delete(activeId!);
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

<div class="list" {@attach selectionControls(selection)}>
	<div class="list-item list-header">
		<span></span>
		{#each [['name', 'storage.generic.name'], ['modifiedAt', 'storage.List.last_modified'], ['size', 'storage.List.size']] as const as [key, translation]}
			<span
				class="header-column"
				onclick={() => (sort = sort?.descending === false ? undefined : { by: key, descending: !sort?.descending })}
			>
				{#if sort?.by == key}
					<Icon i="sort-{sort.descending ? 'down' : 'up'}" />
				{/if}
				<span>{text(translation)}</span>
			</span>
		{/each}
	</div>
	{#each sortedItems as item (item.id)}
		<div
			class={[
				'list-item',
				selection.has(item.id) && 'selected',
				((drag.isActive && selection.has(item.id)) || (!clipboard.isCopy && clipboard.has(item.id))) && 'dimmed',
			]}
			onclick={() => open_with_single_click && openItem(item)}
			ondblclick={() => !open_with_single_click && openItem(item)}
			{@attach drag.source(selection, item.id, { name: item.name, icon: iconForMime(item.type) })}
			{@attach selectable(selection, item.id)}
			{@attach item.type == 'inode/directory' &&
				drag.target(ids =>
					toastStatus(
						moveItems(ids, item.id).then(moved => {
							items = items.filter(item => !moved.includes(item.id));
							selection.clear();
						}),
						text('storage.generic.move_success')
					)
				)}
			{@attach contextMenu(() => {
				// Right-clicking an unselected item acts on just that item.
				if (!selection.has(item.id)) {
					selection.clear();
					selection.add(item.id);
				}
				const multi = selection.size > 1;
				return [
					multi && { header: text('storage.List.items_selected', { count: selection.size }) },
					!multi && {
						i: 'pencil',
						text: text('storage.generic.rename'),
						action: () => startRename(item),
					},
					!multi && {
						i: 'user-group',
						text: text('storage.List.share'),
						action: () => ((activeId = item.id), dialogs['share:' + item.id].showModal()),
					},
					multi
						? { i: 'file-zipper', text: text('storage.List.download_zip'), action: () => _downloadItems(...selection) }
						: { i: 'download', text: text('storage.generic.download'), action: () => _downloadItem(item) },
					{
						i: 'link-horizontal',
						text: multi ? text('storage.List.copy_links') : text('storage.List.copy_link'),
						action: () => copyShortURL(...selection),
					},
					{
						i: 'trash',
						text: text('storage.generic.trash'),
						action: () =>
							toastStatus(
								Promise.all(selection.values().map(id => updateItemMetadata(id, { trash: true }))).then(() => {
									items = items.filter(item => !selection.has(item.id));
									selection.clear();
								}),
								text('storage.generic.trash_success')
							),
					},
					user?.preferences?.debug && {
						i: 'hashtag',
						text: multi ? text('storage.generic.copy_ids') : text('storage.generic.copy_id'),
						action: () => copy('text/plain', [...selection].join(', ')),
					},
				];
			})}
		>
			<dfn class="type" title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			{#if special && full_path_in_special}
				<Path {item} />
			{:else if editingId == item.id}
				<span
					class="name editing"
					data-no-select
					onclick={e => e.stopPropagation()}
					{@attach wrapper => {
						const input = wrapper.querySelector('input')!;
						requestAnimationFrame(() => {
							input.focus();
							const dot = item.name.lastIndexOf('.');
							input.setSelectionRange(0, item.type == 'inode/directory' || dot <= 0 ? item.name.length : dot);
						});
						const onOutside = (e: PointerEvent) => !wrapper.contains(e.target as Node) && (editingId = undefined);
						requestAnimationFrame(() => document.addEventListener('pointerdown', onOutside, true));
						return () => document.removeEventListener('pointerdown', onOutside, true);
					}}
				>
					<input
						class="editable-name"
						bind:value={editingName}
						onkeydown={e => {
							if (e.key == 'Enter') commitRename(item);
							else if (e.key == 'Escape') editingId = undefined;
						}}
					/>
					<button class="reset confirm-rename" aria-label={text('storage.generic.rename')} onclick={() => commitRename(item)}>
						<Icon i="check" />
					</button>
				</span>
			{:else}
				<span class="name">{item.name}</span>
			{/if}
			<span class="modified mobile-subtle">{item.modifiedAt.toLocaleString()}</span>
			<span class={['size', item.type != 'inode/directory' && 'file-size', 'mobile-subtle']}
				>{item.type == 'inode/directory' ? '—' : formatBytes(item.size)}</span
			>
			<div
				class="item-actions"
				data-no-select
				onclick={e => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}}
			>
				{@render action('share:' + item.id, 'user-group', item.id)}
				<span class="icon-text action" onclick={() => _downloadItem(item)}>
					<Icon i="download" --size="14px" />
				</span>
				<span
					class="icon-text action"
					onclick={() => {
						activeId = item.id;
						toastStatus(
							updateItemMetadata(item.id, { trash: true }).then(removeActiveItem),
							text('storage.generic.trash_success')
						);
					}}
				>
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

<style>
	.name {
		overflow: hidden;
		text-overflow: ellipsis;

		&.editing {
			display: flex;
			align-items: center;
			gap: 0.5em;
			overflow: visible;
		}
	}

	.editable-name {
		background: var(--bg-normal);
		border: var(--border-accent);
		border-radius: 0.25em;
		padding: 0.1em 0.25em;
		margin: -0.1em 0;
		font: inherit;
		color: inherit;
		min-width: 0;
		flex: 1 1 auto;
	}

	.confirm-rename {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		cursor: pointer;
	}

	.item-actions {
		display: contents;
	}

	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(3, 1em);
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

			.name {
				grid-column: 2 / -1;
			}

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
