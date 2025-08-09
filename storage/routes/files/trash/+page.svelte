<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { FormDialog, Icon } from '@axium/server/components';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import '@axium/storage/styles/list';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let items = $state(data.items);
	let restoreDialog = $state<HTMLDialogElement>()!;
	let deleteDialog = $state<HTMLDialogElement>()!;

	let activeIndex = $state<number>(-1);
	const activeItem = $derived(activeIndex == -1 ? null : items[activeIndex]);

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
	<title>Files - Trash</title>
</svelte:head>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
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
		<p class="list-empty">Trash is empty.</p>
	{/each}
</div>

{#snippet _name()}
	{#if activeItem?.name}<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
	{:else}this
	{/if}
{/snippet}

<FormDialog
	bind:dialog={restoreDialog}
	submitText="Restore"
	submit={async () => {
		if (!activeItem) throw 'No item is selected';
		await updateItemMetadata(activeItem.id, { trash: false });
		items.splice(activeIndex, 1);
	}}
>
	<p>Restore {@render _name()}?</p>
</FormDialog>
<FormDialog
	bind:dialog={deleteDialog}
	submitText="Delete"
	submitDanger
	submit={async () => {
		if (!activeItem) throw 'No item is selected';
		await deleteItem(activeItem.id);
		items.splice(activeIndex, 1);
	}}
>
	<p>
		Are you sure you want to permanently delete {@render _name()}?
	</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em 1em 1em;
	}
</style>
