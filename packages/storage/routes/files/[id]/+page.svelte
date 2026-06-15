<script lang="ts">
	import { text } from '@axium/client';
	import { drag } from '@axium/client/attachments';
	import { AccessControlDialog, FormDialog, Icon } from '@axium/client/components';
	import { toastStatus } from '@axium/client/toast';
	import { getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { _downloadItem, copyShortURL, moveItems } from '@axium/storage/client/frontend';
	import { Add, List, Path, Preview } from '@axium/storage/components';
	import type { Attachment } from 'svelte/attachments';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	let items = $state(data.items!);
	const item = $derived(data.item);
	const user = $derived(data.session?.user);
	let shareDialog = $state<HTMLDialogElement>()!;
	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	const parentHref = $derived('/files' + (item.parentId ? '/' + item.parentId : ''));

	function moveTo(ids: string[], parentId: string | null) {
		toastStatus(
			moveItems(ids, parentId).then(async () => {
				if (item.type == 'inode/directory') items = await getDirectoryMetadata(item.id);
			}),
			text('storage.generic.move_success')
		);
	}
</script>

<svelte:head>
	<title>{text('page.files.detail_title', { name: item.name })}</title>
</svelte:head>

{#if item.trashedAt}
	<p>{text('page.files.trashed')}</p>
	<button
		onclick={async e => {
			e.preventDefault();
			await updateItemMetadata(item.id, { trash: false });
		}}
	>
		<Icon i="trash-can-undo" />
		{text('page.files.restore')}
	</button>
{:else}
	<AccessControlDialog bind:dialog={shareDialog} {item} itemType="storage" {user} />
	<Path {item} onDropMove={moveTo} />
	{#snippet action(i: string, text: string, handler: (e: Event) => unknown, attachment?: Attachment<HTMLElement>)}
		<button
			class="icon-text"
			onclick={e => {
				e.preventDefault();
				handler(e);
			}}
			{@attach attachment}
		>
			<Icon {i} />
			<span class="mobile-hide">{text}</span>
		</button>
	{/snippet}

	<div class="folder-actions">
		{@render action(
			'folder-arrow-up',
			text('page.files.back'),
			() => (location.href = parentHref),
			drag.target(ids => moveTo(ids, item.parentId))
		)}
		{@render action('pencil', text('page.files.rename'), () => dialogs.rename.showModal())}
		{@render action('user-group', text('page.files.share'), () => shareDialog.showModal())}
		{@render action('download', text('page.files.download'), () => _downloadItem(item))}
		{@render action('link-horizontal', text('page.files.copy_link'), () => copyShortURL(item.id))}
		{@render action('trash', text('page.files.trash'), () =>
			toastStatus(
				updateItemMetadata(item.id, { trash: true }).then(() => (location.href = parentHref)),
				text('storage.generic.trash_success')
			)
		)}
	</div>
	{#if item.type == 'inode/directory'}
		<List appMode bind:items user={data.session?.user} folderId={item.id} />
		<Add parentId={item.id} onAdd={item => items.push(item)} />
	{:else}
		<div class="preview-container">
			<Preview {item} {shareDialog} onDelete={() => (location.href = parentHref)} noTopBar />
		</div>
	{/if}
	<FormDialog
		bind:dialog={dialogs.rename}
		submitText={text('page.files.rename_submit')}
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
{/if}

<style>
	.preview-container {
		position: relative;
		width: 100%;
		height: calc(100% - 5em);

		@media (width < 700px) {
			height: calc(100% - 6em);
		}
	}

	.folder-actions {
		display: flex;
		gap: 1em;
		align-items: center;
		margin-top: 1em;
	}
</style>
