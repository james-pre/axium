<script lang="ts">
	import { text } from '@axium/client';
	import { drag } from '@axium/client/attachments';
	import { toastUpload, uploadEntries } from '@axium/storage/client/frontend';
	import { Add, List } from '@axium/storage/components';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import type { UserPublic } from '@axium/core';

	let {
		items = $bindable(),
		user,
		id,
	}: {
		items: StorageItemMetadata[];
		user?: UserPublic;
		id: string | null;
	} = $props();
</script>

<div
	class="upload-zone"
	{@attach drag.uploadTarget(text('storage.Folder.drop_upload'), entries =>
		toastUpload(uploadEntries(entries, id, item => items.push(item)))
	)}
>
	<List appMode enableDrag bind:items {user} folderId={id} />
	<Add parentId={id ?? undefined} {user} onAdd={item => items.push(item)} />
</div>

<style>
	.upload-zone {
		min-height: 100%;

		:global(&.drag-over) {
			outline-offset: 2px;
			background-color: hsl(from var(--bg-elevated) h s l / 0.5);
		}
	}
</style>
