<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { FormDialog, Icon } from '@axium/server/components';
	import { deleteItem } from '@axium/storage/client';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let items = $state(data.items);
	let dialog = $state<HTMLDialogElement>();

	let activeIndex = $state<number>(-1);
	const activeItem = $derived(items[activeIndex]);
</script>

<div class="TrashList">
	<div class="TrashItem list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each items as item, i (item.id)}
		<div class="TrashItem">
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{formatBytes(item.size)}</span>
			<span
				class="action"
				onclick={(e: Event) => {
					e.stopPropagation();
					e.preventDefault();
					activeIndex = i;
					dialog?.showModal();
				}}
			>
				<Icon i="trash" --size="14px" --fill="#c44" />
			</span>
		</div>
	{:else}
		<i>Empty.</i>
	{/each}
</div>

<FormDialog
	bind:dialog
	submitText="Delete"
	submitDanger
	submit={async () => {
		await deleteItem(activeItem.id);
		if (activeIndex != -1) items.splice(activeIndex, 1);
	}}
>
	<p>
		Are you sure you want to permanently delete
		{#if activeItem?.name}<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
		{:else}this
		{/if}?
	</p>
</FormDialog>

<style>
	.TrashList {
		display: flex;
		flex-direction: column;
		padding: 0.5em;
	}

	.TrashItem.list-header {
		font-weight: bold;
		border-bottom: 1px solid #bbc;
	}

	.TrashItem {
		display: grid;
		grid-template-columns: 1em 4fr 15em 5em 1em;
		align-items: center;
		gap: 0.5em;
		padding: 0.5em 0;
	}

	.TrashItem:not(:last-child) {
		border-bottom: 1px solid #bbc;
	}

	.TrashItem:not(.list-header):hover {
		background-color: #7777;
	}

	.action {
		visibility: hidden;
	}

	.TrashItem:hover .action {
		visibility: visible;
	}

	.action:hover {
		cursor: pointer;
	}
</style>
