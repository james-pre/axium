<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, Popover } from '@axium/client/components';
	import type { AccessControllable } from '@axium/core';
	import { downloadItem, getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { openers, previews } from '@axium/storage/client/3rd-party';
	import { copyShortURL } from '@axium/storage/client/frontend';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import '@axium/storage/polyfills';
	import './Preview.css';

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
		<Icon i={icon} />
	</span>
{/snippet}

<div class="preview-top-bar">
	<div class="title">{item.name}</div>
	{#if itemOpeners.length}
		{@const [first, ...others] = itemOpeners}
		<div class="openers">
			<span>{text('storage.Preview.open_with')} <a href={first.openURL(item)} target="_blank">{first.name}</a></span>
			{#if others.length}
				<Popover>
					{#snippet toggle()}
						<Icon i="caret-down" />
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
				<Icon i="user-group" />
			</span>
		{/if}
		{@render action('download', 'download')}
		<span class="icon-text preview-action" onclick={() => copyShortURL(item)}>
			<Icon i="link-horizontal" />
		</span>
		{@render action('trash', 'trash')}
		{#if previewDialog}
			<span class="icon-text preview-action mobile-hide" onclick={() => previewDialog.close()}>
				<Icon i="xmark" --size="20px" />
			</span>
		{/if}
	</div>
</div>
<div class="preview-content">
	{#if item.type.startsWith('image/')}
		<img src={item.dataURL} alt={item.name} />
	{:else if item.type.startsWith('audio/')}
		<audio src={item.dataURL} controls></audio>
	{:else if item.type.startsWith('video/')}
		<video src={item.dataURL} controls>
			<track kind="captions" />
		</video>
	{:else if item.type == 'application/pdf'}
		<object data={item.dataURL} type="application/pdf" width="100%" height="100%">
			<embed src={item.dataURL} type="application/pdf" width="100%" height="100%" />
			<a href={item.dataURL} download={item.name}>{text('storage.Preview.pdf_fallback_download')}</a>
		</object>
	{:else if item.type.startsWith('text/')}
		{#await downloadItem(item.id).then(b => b.text())}
			<div class="full-fill no-preview">
				<Icon i="cloud-arrow-down" --size="50px" />
				<span>{text('storage.Preview.loading')}</span>
			</div>
		{:then content}
			<pre class="full-fill preview-text">{content}</pre>
		{:catch}
			<div class="full-fill no-preview">
				<Icon i="cloud-exclamation" --size="50px" />
				<span>{text('storage.Preview.error_loading')}</span>
			</div>
		{/await}
	{:else if previews.has(item.type)}
		{@render previews.get(item.type)!(item)}
	{:else}
		<div class="full-fill no-preview">
			<Icon i="eye-slash" --size="50px" />
			<span>{text('storage.Preview.preview_unavailable')}</span>
		</div>
	{/if}
</div>

<FormDialog
	bind:dialog={dialogs.rename}
	submitText={text('storage.generic.rename')}
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
	submitText={text('storage.generic.trash')}
	submitDanger
	submit={async () => {
		if (!item) throw text('storage.generic.no_item');
		await updateItemMetadata(item.id, { trash: true });
		onDelete();
	}}
>
	<p>{text('storage.Preview.trash_confirm')}</p>
</FormDialog>
<FormDialog
	bind:dialog={dialogs.download}
	submitText={text('storage.generic.download')}
	submit={async () => {
		if (item!.type == 'inode/directory') {
			/** @todo ZIP support */
			const children = await getDirectoryMetadata(item.id);
			for (const child of children) open(child.dataURL, '_blank');
		} else open(item!.dataURL, '_blank');
	}}
>
	<p>{text('storage.Preview.download_confirm')}</p>
</FormDialog>
