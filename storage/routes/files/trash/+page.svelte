<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import type { PageProps } from './$types';
	import { formatItemName } from '@axium/storage/client/frontend';

	const { data }: PageProps = $props();
	let items = $state(data.items);
	let restoreDialog = $state<HTMLDialogElement>()!;
	let deleteDialog = $state<HTMLDialogElement>()!;

	let activeId = $state<string>();
	const activeItem = $derived(items.find(item => item.id === activeId));
	const activeItemName = $derived(formatItemName(activeItem));

	function action(id: string, dialog: () => HTMLDialogElement) {
		return (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			activeId = id;
			dialog().showModal();
		};
	}

	function useAndClearActive(thunk: () => any) {
		if (!activeItem) throw text('storage.generic.no_item');
		const result = thunk();
		const index = items.findIndex(item => item.id === activeId);
		if (index !== -1) items.splice(index, 1);
		return result;
	}
</script>

<svelte:head>
	<title>{text('page.files.trash_page.title')}</title>
</svelte:head>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>{text('storage.generic.name')}</span>
		<span>{text('page.files.trash_page.last_modified')}</span>
		<span>{text('storage.List.size')}</span>
	</div>
	{#each items as item (item.id)}
		<div class="list-item">
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{formatBytes(item.size)}</span>
			<span class="action" onclick={action(item.id, () => restoreDialog)}>
				<Icon i="rotate-left" --size="14px" />
			</span>
			<span class="action" onclick={action(item.id, () => deleteDialog)}>
				<Icon i="trash-can-xmark" --size="14px" --fill="#c44" />
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

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em 1em 1em;
	}
</style>
