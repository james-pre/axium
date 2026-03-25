<script lang="ts">
	import { text } from '@axium/client';
	import { AccessControlDialog, FormDialog, Icon } from '@axium/client/components';
	import { Add, List, Preview } from '@axium/storage/components';
	import type { PageProps } from './$types';
	import { getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { copyShortURL } from '@axium/storage/client/frontend';

	const { data }: PageProps = $props();

	let items = $state(data.items!);
	const item = $derived(data.item);
	const user = $derived(data.session?.user);
	let shareDialog = $state<HTMLDialogElement>()!;
	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	const parentHref = $derived('/files' + (item.parentId ? '/' + item.parentId : ''));
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
	{#if item.parents}
		<p class="parents" data-sveltekit-reload>
			<a href="/files">~</a>
			{#each item.parents as { id, name } (id)}<a href="/files/{id}">{name}</a>{/each}
		</p>
	{/if}
	{#snippet action(i: string, text: string, handler: (e: Event) => unknown)}
		<button
			class="icon-text"
			onclick={e => {
				e.preventDefault();
				handler(e);
			}}
		>
			<Icon {i} />
			<span class="mobile-hide">{text}</span>
		</button>
	{/snippet}

	<div class="folder-actions">
		{@render action('folder-arrow-up', text('page.files.back'), () => (location.href = parentHref))}
		{@render action('pencil', text('page.files.rename'), () => dialogs.rename.showModal())}
		{@render action('user-group', text('page.files.share'), () => shareDialog.showModal())}
		{@render action('download', text('page.files.download'), () => dialogs.download.showModal())}
		{@render action('link-horizontal', text('page.files.copy_link'), () => copyShortURL(item))}
		{@render action('trash', text('page.files.trash'), () => dialogs.trash.showModal())}
	</div>
	{#if item.type == 'inode/directory'}
		<List appMode bind:items user={data.session?.user} />
		<Add parentId={item.id} onAdd={item => items.push(item)} />

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
		<FormDialog
			bind:dialog={dialogs.trash}
			submitText={text('page.files.trash')}
			submitDanger
			submit={async () => {
				await updateItemMetadata(item.id, { trash: true });
				location.href = parentHref;
			}}
		>
			<p>{text('page.files.trash_folder_confirm')}</p>
		</FormDialog>
		<FormDialog
			bind:dialog={dialogs.download}
			submitText={text('page.files.download')}
			submit={async () => {
				/** @todo ZIP support */
				const children = await getDirectoryMetadata(item.id);
				for (const child of children) open(child.dataURL, '_blank');
			}}
		>
			<p>{text('page.files.download_folder_confirm')}</p>
		</FormDialog>
	{:else}
		<div class="preview-container">
			<Preview {item} {shareDialog} onDelete={() => (location.href = parentHref)} noTopBar />
		</div>
	{/if}
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
	}

	.parents {
		margin-top: 0;

		a:not(:first-child)::before {
			content: ' / ';
			color: #888;
		}
	}
</style>
