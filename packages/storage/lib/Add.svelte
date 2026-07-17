<script lang="ts">
	import { preferences, text } from '@axium/client';
	import { FormDialog, Icon, Popover, Upload } from '@axium/client/components';
	import type { UserPublic } from '@axium/core';
	import { forMime } from '@axium/core/icons';
	import { createItemFromFile } from '@axium/storage/client';
	import { toastUpload, uploadFiles } from '@axium/storage/client/frontend';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import { flushSync } from 'svelte';

	const { parentId, user, onAdd }: { parentId?: string; user?: UserPublic; onAdd?(item: StorageItemMetadata): void } = $props();

	let files = $state<FileList>()!,
		isDirectoryUpload = $state(false),
		doubleClicked = false;

	const upload_on_select = user ? await preferences.appPref(user.id, 'files', 'upload_on_select') : false;

	let createType = $state<string>(),
		createIncludesContent = $state(false);

	function startUpload() {
		if (!files?.length) return;
		const selected = Array.from(files);
		files = new DataTransfer().files;
		toastUpload(uploadFiles(selected, parentId, onAdd));
	}
</script>

{#snippet _item(type: string, text: string, includeContent: boolean = false)}
	<button
		class="menu-item reset"
		command="show-modal"
		commandfor="create-dialog"
		onclick={() => {
			createType = type;
			createIncludesContent = includeContent;
		}}
	>
		<Icon i={forMime(type)} />
		{text}
	</button>
{/snippet}

<Popover>
	{#snippet toggle()}
		<button
			class="icon-text StorageAdd"
			ondblclick={() => {
				doubleClicked = true;
				flushSync(() => (isDirectoryUpload = false));
				document.querySelector<HTMLInputElement>('#StorageAdd-upload')?.click();
			}}><Icon i="plus" />{text('storage.Add.text')}</button
		>
	{/snippet}

	<button
		class="menu-item reset"
		command="show-modal"
		commandfor="upload-dialog"
		onclick={() => {
			isDirectoryUpload = false;
			doubleClicked = false;
		}}
	>
		<Icon i="upload" />{text('storage.Add.upload')}
	</button>
	<button
		class="menu-item reset"
		command="show-modal"
		commandfor="upload-dialog"
		onclick={() => {
			isDirectoryUpload = true;
			doubleClicked = false;
		}}
	>
		<Icon i="folder-arrow-up" />{text('storage.Add.upload_folder')}
	</button>
	{@render _item('inode/directory', text('storage.Add.new_folder'))}
	{@render _item('text/plain', text('storage.Add.plain_text'), true)}
</Popover>

<FormDialog
	id="upload-dialog"
	submitText={text('storage.Add.upload')}
	cancel={() => (files = new DataTransfer().files)}
	submit={startUpload}
>
	<Upload
		bind:files
		multiple
		webkitdirectory={isDirectoryUpload}
		onchange={() => {
			if (!doubleClicked && !upload_on_select) return;
			doubleClicked = false;
			document.querySelector<HTMLDialogElement>('#upload-dialog')?.close();
			startUpload();
		}}
		id="StorageAdd-upload"
	/>
</FormDialog>

<FormDialog
	id="create-dialog"
	submitText={text('storage.Add.create')}
	submit={async (data: { name: string; content?: string }) => {
		const file = new File(createIncludesContent ? [data.content!] : [], data.name, { type: createType });
		const item = await createItemFromFile(file, { parentId });
		onAdd?.(item);
	}}
>
	<div>
		<label for="name">{text('storage.generic.name')}</label>
		<input name="name" type="text" required />
	</div>
	{#if createIncludesContent}
		<div>
			<label for="content">{text('storage.Add.content')}</label>
			<input name="content" type="text" size="40" required />
		</div>
	{/if}
</FormDialog>
