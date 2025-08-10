<script lang="ts">
	import { forMime } from '@axium/core/icons';
	import { FormDialog, Icon, Popover, Upload } from '@axium/server/components';
	import { uploadItem } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';

	const { parentId, onadd }: { parentId?: string; onadd?(item: StorageItemMetadata): void } = $props();

	let uploadDialog = $state<HTMLDialogElement>()!;
	let input = $state<HTMLInputElement>();

	let createDialog = $state<HTMLDialogElement>()!;
	let createType = $state<string>();
	let createIncludesContent = $state(false);
</script>

{#snippet _item(type: string, text: string, includeContent: boolean = false)}
	<span
		class="icon-text add-menu-item"
		onclick={() => {
			createType = type;
			createIncludesContent = includeContent;
			createDialog.showModal();
		}}
	>
		<Icon i={forMime(type)} />
		{text}
	</span>
{/snippet}

<Popover>
	{#snippet toggle()}
		<button class="icon-text"><Icon i="plus" />Add</button>
	{/snippet}

	<div class="add-menu">
		<span class="icon-text add-menu-item" onclick={() => uploadDialog.showModal()}><Icon i="upload" />Upload</span>
		{@render _item('inode/directory', 'New Folder')}
		{@render _item('text/plain', 'Plain Text')}
		{@render _item('text/x-uri', 'URL', true)}
	</div>
</Popover>

<FormDialog
	bind:dialog={uploadDialog}
	submitText="Upload"
	submit={async () => {
		for (const file of input?.files!) {
			const item = await uploadItem(file, { parentId });
			onadd?.(item);
		}
	}}
>
	<Upload bind:input multiple />
</FormDialog>

<FormDialog
	bind:dialog={createDialog}
	submitText="Create"
	submit={async (data: { name: string; content?: string }) => {
		const file = new File(createIncludesContent ? [data.content!] : [], data.name, { type: createType });
		const item = await uploadItem(file, { parentId });
		onadd?.(item);
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required />
	</div>
	{#if createIncludesContent}
		<div>
			<label for="content">Content</label>
			<input name="content" type="text" size="40" required />
		</div>
	{/if}
</FormDialog>

<style>
	.add-menu {
		display: flex;
		flex-direction: column;
	}

	.add-menu-item {
		border-radius: 0.5em;
		padding: 0.25em 0.25em;
	}

	.add-menu-item:hover {
		cursor: pointer;
		background-color: #4455;
	}
</style>
