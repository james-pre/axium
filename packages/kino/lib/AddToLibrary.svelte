<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, Popover } from '@axium/client/components';
	import type { User } from '@axium/core';
	import { getAddOptions, startDownload } from '@axium/kino/client';
	import { mediaAccept, type KinoDownload, type KinoDownloadTarget, type KinoUpload } from '@axium/kino/common';
	import DownloadStatus from './DownloadStatus.svelte';
	import { downloads, findDownload, watchDownloads } from './downloads.svelte.js';

	interface Props {
		target: KinoDownloadTarget;
		user?: Pick<User, 'id' | 'isAdmin'>;
		/** Shown when nothing is being added */
		emptyText?: string;
		/** Uploads a file, resolving with the new upload once it finishes. Without it, files can't be uploaded here. */
		uploadFile?(file: File): Promise<KinoUpload | undefined>;
		onUpload?(upload: KinoUpload): void;
		/** A download for the target finished, or was cancelled */
		onDownloadEnd?(): void;
	}

	const { target, user, emptyText, uploadFile, onUpload, onDownloadEnd }: Props = $props();

	const options = await getAddOptions();

	if (options.downloads) void watchDownloads();

	const download = $derived(findDownload(target));

	let previous: KinoDownload | undefined;
	$effect(() => {
		if (previous && !download) onDownloadEnd?.();
		previous = download;
	});

	const canUpload = $derived(!!uploadFile && options.upload);

	let input = $state<HTMLInputElement>(),
		magnetDialog = $state<HTMLDialogElement>();

	function onPicked(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];

		// Clear it so picking the same file again still fires a change event
		event.currentTarget.value = '';

		if (!file) return;

		// Progress is reported by a toast, so there is nothing to wait on here
		void uploadFile!(file).then(result => {
			if (result) onUpload?.(result);
		});
	}
</script>

{#snippet button(onclick?: () => void)}
	<button class="icon-text" {onclick}>
		<Icon i="plus" />
		{text('kino.add_to_library')}
	</button>
{/snippet}

{#if download}
	<DownloadStatus {download} canManage={!!user && (user.id == download.userId || user.isAdmin)} />
{:else}
	{#if canUpload && options.magnet}
		<Popover>
			{#snippet toggle()}
				{@render button()}
			{/snippet}

			<button class="menu-item reset" onclick={() => input?.click()}>
				<Icon i="upload" />
				{text('kino.add.upload')}
			</button>
			<button class="menu-item reset" onclick={() => magnetDialog?.showModal()}>
				<Icon i="magnet" />
				{text('kino.add.magnet')}
			</button>
		</Popover>
	{:else if canUpload}
		{@render button(() => input?.click())}
	{:else if options.magnet}
		{@render button(() => magnetDialog?.showModal())}
	{/if}

	{#if emptyText}
		<span class="subtle">{emptyText}</span>
	{/if}
{/if}

<input bind:this={input} type="file" accept={mediaAccept} onchange={onPicked} hidden />

<FormDialog
	bind:dialog={magnetDialog}
	submitText={text('kino.magnet.submit')}
	clearOnCancel
	submit={async ({ magnet }) => {
		const started = await startDownload({ target, magnet: String(magnet) });
		downloads.set(started.hash, started);
	}}
>
	{#snippet header()}
		<h3>{text('kino.magnet.title')}</h3>
	{/snippet}

	<div>
		<label for="kino-magnet">{text('kino.magnet.label')}</label>
		<input id="kino-magnet" name="magnet" type="url" pattern="magnet:\?.+" placeholder="magnet:?xt=urn:btih:…" required />
	</div>
</FormDialog>
