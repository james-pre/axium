<script lang="ts">
	import { text } from '@axium/client';
	import { contextMenu } from '@axium/client/attachments';
	import { FormDialog, Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import { toastStatus } from '@axium/client/toast';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { clearUserTrash, deleteItem, updateItemMetadata } from '@axium/storage/client';
	import { formatItemName } from '@axium/storage/client/frontend';
	import Path from '@axium/storage/components/Path';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let items = $state(data.items);
	let restoreDialog = $state<HTMLDialogElement>()!;
	let deleteDialog = $state<HTMLDialogElement>()!;

	let activeId = $state<string>();
	const activeItem = $derived(items.find(item => item.id === activeId));
	const activeItemName = $derived(formatItemName(activeItem));

	function useAndClearActive(thunk: () => any) {
		return () => {
			if (!activeItem) throw text('storage.generic.no_item');
			const result = thunk();
			const index = items.findIndex(item => item.id === activeId);
			if (index !== -1) items.splice(index, 1);
			return result;
		};
	}
</script>

<svelte:head>
	<title>{text('page.files.trash_page.title')}</title>
</svelte:head>

<button command="show-modal" commandfor="clear-trash">{text('page.files.trash_page.clear')}</button>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>{text('storage.generic.name')}</span>
		<span>{text('page.files.trash_page.last_modified')}</span>
		<span>{text('storage.List.size')}</span>
	</div>
	{#each items as item (item.id)}
		{const restore = () => ((activeId = item.id), restoreDialog.showModal()),
			remove = () => ((activeId = item.id), deleteDialog.showModal())}
		<div
			class="list-item"
			{@attach contextMenu(
				{ i: 'rotate-left', text: text('page.files.trash_page.restore'), action: restore },
				{ i: 'trash-can-xmark', text: text('page.files.trash_page.delete'), danger: true, action: remove }
			)}
		>
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			{#if data.full_path_in_special}
				<Path {item} />
			{:else}
				<span class="name">{item.name}</span>
			{/if}
			<span class="modified mobile-subtle">{item.modifiedAt.toLocaleString()}</span>
			<span class="size file-size mobile-subtle">{formatBytes(item.size)}</span>
			<span class="action" onclick={restore}>
				<Icon i="rotate-left" --size="14px" />
			</span>
			<span class="action" onclick={remove}>
				<Icon i="trash-can-xmark" --size="14px" --fill="var(--fg-error)" />
			</span>
		</div>
	{:else}
		<p class="list-empty">{text('page.files.trash_page.empty')}</p>
	{/each}
</div>

<FormDialog
	bind:dialog={restoreDialog}
	submitText={text('page.files.trash_page.restore')}
	submit={useAndClearActive(() => updateItemMetadata(activeId!, { trash: false }))}
>
	<p>{text('page.files.trash_page.restore_confirm', { name: activeItemName })}</p>
</FormDialog>
<FormDialog
	bind:dialog={deleteDialog}
	submitText={text('page.files.trash_page.delete')}
	submitDanger
	submit={useAndClearActive(() => deleteItem(activeId!))}
>
	<p>{text('page.files.trash_page.delete_confirm', { name: activeItemName })}</p>
</FormDialog>
<FormDialog
	id="clear-trash"
	submitText={text('page.files.trash_page.delete')}
	submitDanger
	submit={async () => {
		items = [];
		toastStatus(clearUserTrash(data.session.userId), text('page.files.trash_page.clear_success'));
	}}
>
	<p>
		{text('page.files.trash_page.clear_confirm', { count: items.length })}
		{text('generic.action_irreversible')}
	</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em 1em 1em;
	}

	@media (width < 700px) {
		.action {
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
			}
		}
	}
</style>
