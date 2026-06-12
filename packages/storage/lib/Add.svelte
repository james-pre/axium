<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, Popover, Upload } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { forMime } from '@axium/core/icons';
	import { createDirectory, createItemFromFile } from '@axium/storage/client';
	import type { StorageItemMetadata } from '@axium/storage/common';

	const { parentId, onAdd }: { parentId?: string; onAdd?(item: StorageItemMetadata): void } = $props();

	let uploadProgress = $state<[number, number][]>([]),
		uploading = $state(false),
		controller = $state(new AbortController()),
		files = $state<FileList>()!,
		isDirectoryUpload = $state(false);

	let createType = $state<string>(),
		createIncludesContent = $state(false);
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
		<button class="icon-text StorageAdd"><Icon i="plus" />{text('storage.Add.text')}</button>
	{/snippet}

	<button class="menu-item reset" command="show-modal" commandfor="upload-dialog" onclick={() => (isDirectoryUpload = false)}>
		<Icon i="upload" />{text('storage.Add.upload')}
	</button>
	<button class="menu-item reset" command="show-modal" commandfor="upload-dialog" onclick={() => (isDirectoryUpload = true)}>
		<Icon i="folder-arrow-up" />{text('storage.Add.upload_folder')}
	</button>
	{@render _item('inode/directory', text('storage.Add.new_folder'))}
	{@render _item('text/plain', text('storage.Add.plain_text'), true)}
</Popover>

<FormDialog
	id="upload-dialog"
	submitText={text('storage.Add.upload')}
	cancel={() => {
		files = new DataTransfer().files;
		if (!uploading) return;
		uploading = false;
		uploadProgress = [];
		controller.abort();
		toast('info', text('storage.Add.cancelled'));
		controller = new AbortController();
	}}
	submit={async () => {
		uploading = true;

		const directoryIds = new Map<string, Promise<string>>();

		for (const [i, file] of Array.from(files!).entries()) {
			try {
				const path = file.webkitRelativePath?.split('/').filter(part => part.length) || [];
				const name = path.pop() || file.name;

				let itemParentId = parentId,
					currentDir = '';

				for (const directoryName of path) {
					currentDir = currentDir ? `${currentDir}/${directoryName}` : directoryName;
					itemParentId = await directoryIds.getOrInsertComputed(currentDir, async () => {
						const dir = await createDirectory(directoryName, itemParentId);
						if (itemParentId == parentId) onAdd?.(dir);
						return dir.id;
					});
				}

				const item = await createItemFromFile(file, {
					parentId: itemParentId,
					name,
					onProgress(uploaded, total) {
						uploadProgress[i] = [uploaded, total];
					},
					signal: controller.signal,
				});

				if (itemParentId == parentId) onAdd?.(item);
			} catch (e) {
				if (e && e instanceof DOMException && e.name == 'AbortError') return;
				throw e;
			}
		}
		uploading = false;
		uploadProgress = [];
		files = new DataTransfer().files;
	}}
>
	<Upload bind:files bind:progress={uploadProgress} multiple webkitdirectory={isDirectoryUpload} />
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
