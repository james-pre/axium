<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let items = $state(data.items);
	let restoreDialog = $state<HTMLDialogElement>()!;
	let deleteDialog = $state<HTMLDialogElement>()!;

	let activeIndex = $state<number>(-1);
	const activeItem = $derived(activeIndex == -1 ? null : items[activeIndex]);
	const activeItemName = $derived(
		activeItem?.name
			? `<strong>${activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>`
			: 'this'
	);

	function action(index: number, dialog: () => HTMLDialogElement) {
		return (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			activeIndex = index;
			dialog().showModal();
		};
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
	{#each items as item, i (item.id)}
		<div class="list-item">
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{formatBytes(item.size)}</span>
			<span class="action" onclick={action(i, () => restoreDialog)}>
				<Icon i="rotate-left" --size="14px" />
			</span>
			<span class="action" onclick={action(i, () => deleteDialog)}>
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
	submit={async () => {
		if (!activeItem) throw text('storage.generic.no_item');
		await updateItemMetadata(activeItem.id, { trash: false });
		items.splice(activeIndex, 1);
	}}
>
	<p>{@html text('page.files.trash_page.restore_confirm', { $html: true, name: activeItemName })}</p>
</FormDialog>
<FormDialog
	bind:dialog={deleteDialog}
	submitText={text('page.files.trash_page.delete')}
	submitDanger
	submit={async () => {
		if (!activeItem) throw text('storage.generic.no_item');
		await deleteItem(activeItem.id);
		items.splice(activeIndex, 1);
	}}
>
	<p>
		{@html text('page.files.trash_page.delete_confirm', { $html: true, name: activeItemName })}
	</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em 1em 1em;
	}
</style>
