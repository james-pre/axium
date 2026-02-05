<script lang="ts">
	import { AccessControlDialog, FormDialog, Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import type { AccessControllable, UserPublic } from '@axium/core';
	import { formatBytes } from '@axium/core/format';
	import { forMime as iconForMime } from '@axium/core/icons';
	import { downloadItem, getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import previews from '@axium/storage/client/previews';
	import type { StorageItemMetadata } from '@axium/storage/common';

	let {
		items = $bindable(),
		appMode,
		emptyText = 'Folder is empty.',
		user,
	}: { appMode?: boolean; items: (StorageItemMetadata & AccessControllable)[]; emptyText?: string; user?: UserPublic } = $props();

	let activeIndex = $state<number>(0);
	const activeItem = $derived(items[activeIndex]);
	const dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string, i: number, preview: boolean = false)}
	<span
		class={[!preview && 'action']}
		onclick={() => {
			activeIndex = i;
			dialogs[name].showModal();
		}}
	>
		<Icon i={icon} --size={preview ? '18px' : '14px'} />
	</span>
{/snippet}

{#snippet _itemName()}
	{#if activeItem?.name}
		<strong>{activeItem.name.length > 23 ? activeItem.name.slice(0, 20) + '...' : activeItem.name}</strong>
	{:else}
		this
	{/if}
{/snippet}

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>Name</span>
		<span>Last Modified</span>
		<span>Size</span>
	</div>
	{#each items as item, i (item.id)}
		<div
			class="list-item"
			onclick={async () => {
				if (item.type != 'inode/directory') {
					dialogs['preview:' + item.id].showModal();
				} else if (appMode) location.href = '/files/' + item.id;
				else items = await getDirectoryMetadata(item.id);
			}}
		>
			<dfn title={item.type}><Icon i={iconForMime(item.type)} /></dfn>
			<span class="name">{item.name}</span>
			<span>{item.modifiedAt.toLocaleString()}</span>
			<span>{item.type == 'inode/directory' ? '—' : formatBytes(item.size)}</span>
			<div
				style:display="contents"
				onclick={e => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}}
			>
				{@render action('rename', 'pencil', i)}
				{@render action('share' + item.id, 'user-group', i)}
				<AccessControlDialog
					bind:dialog={dialogs['share' + item.id]}
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
				{@render action('download', 'download', i)}
				{@render action('trash', 'trash', i)}
				<dialog bind:this={dialogs['preview:' + item.id]} class="preview">
					<div class="title">{item.name}</div>
					<div class="actions">
						{@render action('rename', 'pencil', i, true)}
						{@render action('share' + item.id, 'user-group', i, true)}
						{@render action('download', 'download', i, true)}
						{@render action('trash', 'trash', i, true)}
						<span onclick={() => dialogs['preview:' + item.id].close()}><Icon i="xmark" --size="20px" /></span>
					</div>
					<div class="content">
						{#if item.type.startsWith('image/')}
							<img src={item.dataURL} alt={item.name} width="100%" />
						{:else if item.type.startsWith('audio/')}
							<audio src={item.dataURL} controls></audio>
						{:else if item.type.startsWith('video/')}
							<video src={item.dataURL} controls width="100%">
								<track kind="captions" />
							</video>
						{:else if item.type == 'application/pdf'}
							<object data={item.dataURL} type="application/pdf" width="100%" height="100%">
								<embed src={item.dataURL} type="application/pdf" width="100%" height="100%" />
								<p>PDF not displayed? <a href={item.dataURL} download={item.name}>Download</a></p>
							</object>
						{:else if item.type.startsWith('text/')}
							<div class="preview-content-text">
								{#await downloadItem(item.id).then(b => b.text()) then content}{content}{/await}
							</div>
						{:else if previews.has(item.type)}
							{@render previews.get(item.type)!(item)}
						{:else}
							<div class="no-preview">
								<Icon i="eye-slash" />
								<span>Preview not available</span>
							</div>
						{/if}
					</div>
				</dialog>
			</div>
		</div>
	{:else}
		<p class="list-empty">{emptyText}</p>
	{/each}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText="Rename"
	submit={async (data: { name: string }) => {
		if (!activeItem) throw 'No item is selected';
		await updateItemMetadata(activeItem.id, data);
		activeItem.name = data.name;
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required value={activeItem?.name} />
	</div>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.trash}
	submitText="Trash"
	submitDanger
	submit={async () => {
		if (!activeItem) throw 'No item is selected';
		await updateItemMetadata(activeItem.id, { trash: true });
		items.splice(activeIndex, 1);
	}}
>
	<p>Are you sure you want to trash {@render _itemName()}?</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText="Download"
	submit={async () => {
		if (activeItem!.type == 'inode/directory') {
			/** @todo ZIP support */
			const children = await getDirectoryMetadata(activeItem!.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(activeItem!.dataURL, '_blank');
	}}
>
	<p>Are you sure you want to download {@render _itemName()}?</p>
</FormDialog>

<style>
	.list-item {
		grid-template-columns: 1em 4fr 15em 5em repeat(4, 1em);
	}

	dialog.preview {
		inset: 0;
		width: 100%;
		height: 100%;
		background-color: #0008;
		border: none;
		padding: 1em;
		word-wrap: normal;

		.title,
		.actions {
			align-items: center;
			display: flex;
			align-items: center;
			gap: 1em;
			position: absolute;
			top: 1em;
			padding: 1em;
			height: 1em;
		}

		.title {
			left: 1em;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.actions {
			right: 0;
		}

		.content {
			position: absolute;
			inset: 3em 10em 0;

			.preview-content-text {
				position: absolute;
				inset: 0;
				line-height: 1.6;
				background-color: var(--bg-menu);
				font-family: monospace;
			}
		}

		.no-preview {
			display: flex;
			flex-direction: column;
			gap: 1em;
			align-items: center;
			justify-content: center;
		}

		@media (width < 700px) {
			.actions {
				top: 3em;
				left: 1em;
			}

			.content {
				inset: 5em 1em 0;
			}
		}
	}
</style>
