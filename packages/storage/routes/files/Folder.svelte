<script lang="ts">
	import { text } from '@axium/client';
	import { drag } from '@axium/client/attachments';
	import { toastStatus } from '@axium/client/toast';
	import { uploadEntries } from '@axium/storage/client/frontend';
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
		toastStatus(
			uploadEntries(entries, id, item => items.push(item)),
			text('storage.generic.upload_success')
		)
	)}
>
	<List appMode enableDrag bind:items {user} folderId={id} />
	<Add parentId={id ?? undefined} onAdd={item => items.push(item)} />
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
