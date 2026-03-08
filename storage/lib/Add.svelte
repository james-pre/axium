<script lang="ts">
	import { forMime } from '@axium/core/icons';
	import { FormDialog, Icon, Popover, Upload } from '@axium/client/components';
	import { uploadItem } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import { text } from '@axium/client';

	const { parentId, onAdd }: { parentId?: string; onAdd?(item: StorageItemMetadata): void } = $props();

	let uploadDialog = $state<HTMLDialogElement>()!;
	let uploadProgress = $state<[number, number][]>([]);
	let files = $state<FileList>()!;

	let createDialog = $state<HTMLDialogElement>()!;
	let createType = $state<string>();
	let createIncludesContent = $state(false);
</script>

{#snippet _item(type: string, text: string, includeContent: boolean = false)}
	<span
		class="menu-item"
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
		<button class="icon-text StorageAdd"><Icon i="plus" />{text('storage.Add.text')}</button>
	{/snippet}

	<span class="menu-item" onclick={() => uploadDialog.showModal()}><Icon i="upload" />{text('storage.Add.upload')}</span>
	{@render _item('inode/directory', text('storage.Add.new_folder'))}
	{@render _item('text/plain', text('storage.Add.plain_text'))}
	{@render _item('text/x-uri', text('storage.Add.url'), true)}
</Popover>

<FormDialog
	bind:dialog={uploadDialog}
	submitText={text('storage.Add.upload')}
	cancel={() => (files = new DataTransfer().files)}
	submit={async () => {
		for (const [i, file] of Array.from(files!).entries()) {
			const item = await uploadItem(file, {
				parentId,
				onProgress(uploaded, total) {
					uploadProgress[i] = [uploaded, total];
				},
			});
			onAdd?.(item);
		}
	}}
>
	<Upload bind:files bind:progress={uploadProgress} multiple />
</FormDialog>

<FormDialog
	bind:dialog={createDialog}
	submitText={text('storage.Add.create')}
	submit={async (data: { name: string; content?: string }) => {
		const file = new File(createIncludesContent ? [data.content!] : [], data.name, { type: createType });
		const item = await uploadItem(file, { parentId });
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
