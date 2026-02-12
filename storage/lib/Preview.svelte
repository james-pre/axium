<script lang="ts">
	import { FormDialog, Icon, Popover } from '@axium/client/components';
	import type { AccessControllable } from '@axium/core';
	import { downloadItem, getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { openers, previews } from '@axium/storage/client/3rd-party';
	import type { StorageItemMetadata } from '@axium/storage/common';

	const {
		item,
		shareDialog,
		previewDialog,
		onDelete = () => {},
	}: {
		item: StorageItemMetadata & AccessControllable;
		shareDialog?: HTMLDialogElement;
		previewDialog?: HTMLDialogElement;
		onDelete?(): unknown;
	} = $props();

	const itemOpeners = openers.filter(opener => opener.types.includes(item.type));

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string)}
	<span class="icon-text preview-action" onclick={() => dialogs[name].showModal()}>
		<Icon i={icon} --size="18px" />
	</span>
{/snippet}

<div class="preview-top-bar">
	<div class="title">{item.name}</div>
	{#if itemOpeners.length}
		{@const [first, ...others] = itemOpeners}
		<div class="openers">
			<span>Open with <a href={first.openURL(item)} target="_blank">{first.name}</a></span>
			{#if others.length}
				<Popover>
					{#snippet toggle()}
						<span class="popover-toggle"><Icon i="caret-down" /></span>
					{/snippet}
					{#each others as opener}
						<a href={opener.openURL(item)} target="_blank">{opener.name}</a>
					{/each}
				</Popover>
			{/if}
		</div>
	{/if}
	<div class="actions">
		{@render action('rename', 'pencil')}
		{#if shareDialog}
			<span class="icon-text preview-action" onclick={() => shareDialog.showModal()}>
				<Icon i="user-group" --size="18px" />
			</span>
		{/if}
		{@render action('download', 'download')}
		{@render action('trash', 'trash')}
		{#if previewDialog}
			<span class="mobile-hide" onclick={() => previewDialog.close()}>
				<Icon i="xmark" --size="20px" />
			</span>
		{/if}
	</div>
</div>
<div class="preview-content">
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
		{#await downloadItem(item.id).then(b => b.text())}
			<div class="full-fill no-preview">
				<Icon i="cloud-arrow-down" --size="50px" />
				<span>Loading</span>
			</div>
		{:then content}
			<pre class="full-fill preview-text">{content}</pre>
		{:catch}
			<div class="full-fill no-preview">
				<Icon i="cloud-exclamation" --size="50px" />
				<span>Error loading preview. You might not have permission to view this file.</span>
			</div>
		{/await}
	{:else if previews.has(item.type)}
		{@render previews.get(item.type)!(item)}
	{:else}
		<div class="full-fill no-preview">
			<Icon i="eye-slash" --size="50px" />
			<span>Preview not available</span>
		</div>
	{/if}
</div>

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
		if (!item) throw 'No item is selected';
		await updateItemMetadata(item.id, { trash: true });
		onDelete();
	}}
>
	<p>Are you sure you want to trash this?</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText="Download"
	submit={async () => {
		if (item!.type == 'inode/directory') {
			/** @todo ZIP support */
			const children = await getDirectoryMetadata(item.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(item!.dataURL, '_blank');
	}}
>
	<p>Are you sure you want to download this?</p>
</FormDialog>

<style>
	:host {
		anchor-scope: --preview-openers;
	}

	.preview-action:hover {
		cursor: pointer;
	}

	.preview-top-bar {
		display: flex;
		align-items: center;
		gap: 1em;
		justify-content: space-between;
		padding: 0;
		position: absolute;
		inset: 0.5em 1em 0;
		height: fit-content;

		> div {
			display: flex;
			gap: 1em;
			align-items: center;
		}
	}

	.openers {
		padding: 1em;
		border: 1px solid var(--border-accent);
		border-radius: 1em;
		height: 2em;
		anchor-name: --preview-openers;
	}

	.openers :global([popover]) {
		inset: anchor(bottom) anchor(right) auto anchor(left);
		position-anchor: --preview-openers;
		width: anchor-size(width);
	}

	.actions {
		right: 0;
	}

	.preview-content {
		position: absolute;
		inset: 3em 10em 0;

		.full-fill {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
		}

		.preview-text {
			white-space: pre-wrap;
			overflow-y: scroll;
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
		.preview-top-bar {
			flex-direction: column;

			.actions {
				justify-content: space-around;
				width: 100%;

				.preview-action {
					padding: 1em;
					flex: 1 1 0;
					border-radius: 1em;
					border: 1px solid var(--border-accent);
					padding: 1em;
					justify-content: center;
					display: flex;
				}
			}
		}

		.preview-content {
			inset: 10em 1em 0;
		}
	}
</style>
