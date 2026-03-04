<script lang="ts">
	import { text } from '@axium/client';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';
	import { FormDialog, Icon } from '@axium/client/components';
	import * as icon from '@axium/core/icons';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import { getDirectory, selection, toggle, toggleRange } from '@axium/storage/sidebar';
	import SidebarItem from './SidebarItem.svelte';
	import { formatItemName } from '@axium/storage/client/frontend';

	let {
		item = $bindable(),
		items = $bindable(),
	}: {
		item: StorageItemMetadata;
		/** The items list for the parent directory */
		items: StorageItemMetadata[];
	} = $props();

	const dialogs = $state<Record<string, HTMLDialogElement>>({});
	let popover = $state<HTMLDivElement>();

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		popover!.togglePopover();
		_forcePopover = true;
	}

	function onclick(e: MouseEvent) {
		if (e.shiftKey) toggleRange(item.id);
		else if (e.ctrlKey) toggle(item.id);
		else {
			selection.clear();
			toggle(item.id);
		}
	}

	let _forcePopover = false;

	/**
	 * Workaround for https://github.com/whatwg/html/issues/10905
	 * @todo Remove when the problem is fixed.
	 */
	function onpointerup(e: PointerEvent) {
		if (!_forcePopover) return;
		e.stopPropagation();
		e.preventDefault();
		popover!.togglePopover();
		_forcePopover = false;
	}

	let children = $state<StorageItemMetadata[]>([]);

	const itemName = $derived(formatItemName(item));
</script>

{#snippet action(name: string, i: string, label: string)}
	<div
		onclick={e => {
			e.stopPropagation();
			e.preventDefault();
			dialogs[name].showModal();
		}}
		class="action icon-text"
	>
		<Icon {i} --size="14px" />
		{label}
	</div>
{/snippet}

{#if item.type == 'inode/directory'}
	<details>
		<summary class={['StorageSidebarItem', selection.has(item.id) && 'selected']} {onclick} {oncontextmenu} {onpointerup}>
			<Icon i={icon.forMime(item.type)} />
			<span class="name">{item.name}</span>
		</summary>
		<div>
			{#await getDirectory(item.id, children)}
				<i>{text('generic.loading')}</i>
			{:then}
				{#each children as _, i (_.id)}
					<SidebarItem bind:item={children[i]} bind:items={children} />
				{/each}
			{:catch error}
				<i class="error-text">{error.message}</i>
			{/await}
		</div>
	</details>
{:else}
	<div class={['StorageSidebarItem', selection.has(item.id) && 'selected']} {onclick} {oncontextmenu} {onpointerup}>
		<Icon i={icon.forMime(item.type)} />
		<span class="name">{item.name}</span>
	</div>
{/if}

<div popover bind:this={popover}>
	{@render action('rename', 'pen', text('storage.generic.rename'))}
	{@render action('delete', 'trash', text('storage.SidebarItem.delete'))}
	{#if item.type == 'cas_item'}
		{@render action('download', 'download', text('storage.generic.download'))}
	{/if}
	{#if page.data.session?.user.preferences.debug}
		<div class="action icon-text" onclick={() => copy('text/plain', item.id)}>
			<Icon i="copy" --size="14px" />
			{text('storage.generic.copy_id')}
		</div>
	{/if}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText={text('storage.generic.rename')}
	submit={async (data: { name: string }) => {
		await updateItemMetadata(item.id, data);
		item.name = data.name;
	}}
>
	<div>
		<label for="name">{text('storage.generic.name')}</label>
		<input name="name" type="text" required value={item.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.delete}
	submitText={text('storage.SidebarItem.delete')}
	submitDanger
	submit={async () => {
		await deleteItem(item.id);
		const index = items.findIndex(r => r.id === item.id);
		if (index !== -1) items.splice(index, 1);
	}}
>
	<p>{@html text('storage.SidebarItem.delete_confirm', { $html: true, name: itemName })}</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText={text('storage.generic.download')}
	submit={async () => {
		open(item.dataURL, '_blank');
	}}
>
	<p>
		{text('storage.SidebarItem.download_disclaimer')} <br />
		{@html text('storage.generic.download_confirm', { $html: true, name: itemName })}
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
		background: var(--bg-strong);
		cursor: pointer;
	}

	.selected {
		border: 1px solid #555;
		background: var(--bg-strong);
	}

	details > div {
		padding-left: 0.5em;
	}

	div.action:hover {
		cursor: pointer;
		background-color: var(--bg-accent);
		border-radius: 0.25em;
	}
</style>
