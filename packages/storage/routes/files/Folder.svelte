<script lang="ts">
	import { text } from '@axium/client';
	import { drag } from '@axium/client/attachments';
	import { syncObjects } from '@axium/client/reactive';
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

	const onfocusout = syncObjects(() => items, {
		type: 'storage',
		filter: item => item.parentId == id && !item.trashedAt && (!!id || item.userId == user?.id),
	});

	function onAdd(item: StorageItemMetadata, replaced?: string) {
		if (replaced) items = items.filter(existing => existing.id != replaced);
		if (!items.some(existing => existing.id == item.id)) items.push(item);
	}
</script>

<svelte:window {onfocusout} />

<div
	class="upload-zone"
	{@attach drag.uploadTarget(text('storage.Folder.drop_upload'), entries => toastUpload(uploadEntries(entries, id, onAdd)))}
>
	<List appMode enableDrag bind:items {user} folderId={id} />
	<Add parentId={id ?? undefined} {user} {onAdd} />
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
