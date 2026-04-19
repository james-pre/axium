<script lang="ts">
	import { text } from '@axium/client';
	import { Audio, FormDialog, Icon, Popover, Video } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import type { AccessControllable } from '@axium/core';
	import { downloadItem, downloadItemStream, getDirectoryMetadata, updateItemMetadata } from '@axium/storage/client';
	import { openers, previews } from '@axium/storage/client/3rd-party';
	import { _downloadItem, copyShortURL } from '@axium/storage/client/frontend';
	import type { StorageItemMetadata } from '@axium/storage/common';
	import '@axium/storage/polyfills';
	import './Preview.css';

	const {
		item,
		shareDialog,
		previewDialog,
		onDelete = () => {},
		noTopBar,
	}: {
		item: StorageItemMetadata & AccessControllable;
		shareDialog?: HTMLDialogElement;
		previewDialog?: HTMLDialogElement;
		onDelete?(): unknown;
		/** Set when the preview is displayed for an item not inside a directory (e.g. when sharing links to files) */
		noTopBar?: boolean;
	} = $props();

	const itemOpeners = openers.filter(opener => opener.types.includes(item.type));

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

{#snippet action(name: string, icon: string)}
	<span class="icon-text preview-action" onclick={() => dialogs[name].showModal()}>
		<Icon i={icon} />
	</span>
{/snippet}

{#if !noTopBar}
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
			<span class="icon-text preview-action" onclick={() => _downloadItem(item)}>
				<Icon i="download" />
			</span>
			<span class="icon-text preview-action" onclick={() => copyShortURL(item)}>
				<Icon i="link-horizontal" />
			</span>
			<span
				class="icon-text preview-action"
				onclick={async () => {
					try {
						if (!item) throw text('storage.generic.no_item');
						await updateItemMetadata(item.id, { trash: true });
						onDelete();
						toast('success', text('storage.generic.trash_success'));
					} catch (e) {
						toast('error', e);
					}
				}}
			>
				<Icon i="trash" />
			</span>
			{#if previewDialog}
				<span class="icon-text preview-action mobile-hide" onclick={() => previewDialog.close()}>
					<Icon i="xmark" --size="20px" />
				</span>
			{/if}
		</div>
	</div>
{/if}

{#snippet loading()}
	<div class="preview-center">
		<Icon i="cloud-arrow-down" --size="50px" />
		<span>{text('storage.Preview.loading')}</span>
	</div>
{/snippet}

<div class={['preview-content', noTopBar && 'no-top-bar']}>
	{#if item.type.startsWith('image/')}
		<img src={item.dataURL} alt={item.name} />
	{:else if item.type.startsWith('audio/')}
		{#await downloadItemStream(item.id)}
			{@render loading()}
		{:then stream}
			<Audio src={item.dataURL} {...item} metadataSource={stream} cover />
		{/await}
	{:else if item.type.startsWith('video/')}
		{#await downloadItemStream(item.id)}
			{@render loading()}
		{:then stream}
			<Video src={item.dataURL} {...item} metadataSource={stream} />
		{/await}
	{:else if item.type == 'application/pdf'}
		<object data={item.dataURL} type="application/pdf" width="100%" height="100%">
			<embed src={item.dataURL} type="application/pdf" width="100%" height="100%" />
			<a href={item.dataURL} download={item.name}>{text('storage.Preview.pdf_fallback_download')}</a>
		</object>
	{:else if item.type.startsWith('text/')}
		{#await downloadItem(item.id).then(b => b.text())}
			{@render loading()}
		{:then content}
			<pre class="full-fill preview-text">{content}</pre>
		{:catch}
			<div class="preview-center">
				<Icon i="cloud-exclamation" --size="50px" />
				<span>{text('storage.Preview.error_loading')}</span>
			</div>
		{/await}
	{:else if previews.has(item.type)}
		{@render previews.get(item.type)!(item)}
	{:else}
		<div class="preview-center">
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
