<script lang="ts">
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
{:else}
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
	{#if item.parents}
		<p class="parents" data-sveltekit-reload>
			{#each item.parents as { id, name } (id)}<a href="/files/{id}">{name}</a>{/each}
		</p>
	{/if}
	{#if item.type == 'inode/directory'}
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
			{@render action('folder-arrow-up', 'Back', () => (location.href = parentHref))}
			{@render action('pencil', 'Rename', () => dialogs.rename.showModal())}
			{@render action('user-group', 'Share', () => shareDialog.showModal())}
			{@render action('download', 'Download', () => dialogs.download.showModal())}
			{@render action('link-horizontal', 'Copy Link', () => copyShortURL(item))}
			{@render action('trash', 'Trash', () => dialogs.trash.showModal())}
		</div>

		<List appMode bind:items user={data.session?.user} />
		<Add parentId={item.id} onAdd={item => items.push(item)} />

		<FormDialog
			bind:dialog={dialogs.rename}
			submitText="Rename"
			submit={async (data: { name: string }) => {
				await updateItemMetadata(item.id, data);
				item.name = data.name;
			}}
		>
			<div>
				<label for="name">Name</label>
				<input name="name" type="text" required value={item.name} />
			</div>
		</FormDialog>
		<FormDialog
			bind:dialog={dialogs.trash}
			submitText="Trash"
			submitDanger
			submit={async () => {
				await updateItemMetadata(item.id, { trash: true });
				location.href = parentHref;
			}}
		>
			<p>Are you sure you want to trash this folder?</p>
		</FormDialog>
		<FormDialog
			bind:dialog={dialogs.download}
			submitText="Download"
			submit={async () => {
				/** @todo ZIP support */
				const children = await getDirectoryMetadata(item.id);
				for (const child of children) open(child.dataURL, '_blank');
			}}
		>
			<p>Are you sure you want to download this folder?</p>
		</FormDialog>
	{:else}
		<div class="preview-container">
			<Preview {item} {shareDialog} onDelete={() => (location.href = parentHref)} />
		</div>
	{/if}
{/if}

<style>
	.preview-container {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.folder-actions {
		display: flex;
		gap: 1em;
		align-items: center;
	}

	.parents a::before {
		content: ' / ';
		color: #888;
	}
</style>
