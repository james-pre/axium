<script lang="ts">
	import { AccessControlDialog, Icon } from '@axium/client/components';
	import { Add, List, Preview } from '@axium/storage/components';
	import type { PageProps } from './$types';
	import { updateItemMetadata } from '@axium/storage/client';

	const { data }: PageProps = $props();

	let items = $state(data.items!);
	const item = $derived(data.item);
	const user = $derived(data.session?.user);
	let shareDialog = $state<HTMLDialogElement>();

	const parentHref = $derived('/files' + (item.parentId ? '/' + item.parentId : ''));
</script>

<svelte:head>
	<title>Files — {item.name}</title>
</svelte:head>

{#if item.trashedAt}
	<p>This item is trashed</p>
	<button
		onclick={async e => {
			e.preventDefault();
			await updateItemMetadata(item.id, { trash: false });
		}}
	>
		<Icon i="trash-can-undo" /> Restore
	</button>
{:else if item.type == 'inode/directory'}
	<button
		class="icon-text"
		onclick={e => {
			e.preventDefault();
			location.href = parentHref;
		}}
	>
		<Icon i="folder-arrow-up" /> Back
	</button>
	<List appMode bind:items user={data.session?.user} />
	<Add parentId={item.id} onAdd={item => items.push(item)} />
{:else}
	<div class="preview-container">
		<AccessControlDialog
			bind:dialog={shareDialog}
			{item}
			itemType="storage"
			editable={(item.acl?.find(
				a =>
					a.userId == user?.id ||
					(a.role && user?.roles.includes(a.role)) ||
					(a.tag && user?.tags?.includes(a.tag)) ||
					(!a.userId && !a.role && !a.tag)
			)?.manage as boolean | undefined) ?? true}
		/>
		<Preview {item} {shareDialog} onDelete={() => (location.href = parentHref)} />
	</div>
{/if}

<style>
	.preview-container {
		position: relative;
		width: 100%;
		height: 100%;
	}
</style>
