<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, Upload } from '@axium/client/components';
	import { formatBytes } from '@axium/core/format';
	import type { KinoUpload } from '@axium/kino/common';

	interface Props {
		/** The upload backing this movie/episode, or nullish when nothing has been uploaded */
		upload?: KinoUpload | null;
		/** Where the "watch" button links to */
		watchHref: string;
		/** The `/raw` URL the file is downloaded from */
		dataURL: string;
		/** Label for the upload dialog's submit button */
		uploadText: string;
		/** Performs the upload, resolving with the new upload once it finishes */
		uploadFile(file: File): Promise<KinoUpload | undefined>;
	}

	let { upload = $bindable(), watchHref, dataURL, uploadText, uploadFile }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let files = $state<FileList>();

	function submit() {
		const file = files?.[0];
		if (!file) return;

		// Clear the picker so the dialog is ready for the next upload, and let the toast report progress
		files = new DataTransfer().files;

		void uploadFile(file).then(result => {
			if (result) upload = result;
		});
	}
</script>

<div class="MediaActions">
	{#if upload}
		<a class="action icon-text" href={watchHref}>
			<Icon i="play" />
			{text('kino.watch')}
		</a>
		<a class="action icon-text" href={dataURL} download={upload.name}>
			<Icon i="download" />
			{text('kino.download')}
		</a>
		<span class="subtle">
			{text('kino.uploaded_detail', { date: upload.uploadedAt.toLocaleDateString(), size: formatBytes(upload.size) })}
		</span>
	{:else}
		<button class="icon-text" onclick={() => dialog?.showModal()}>
			<Icon i="upload" />
			{text('kino.upload')}
		</button>
		<span class="subtle">{text('kino.not_uploaded')}</span>
	{/if}
</div>

<FormDialog bind:dialog submitText={uploadText} {submit} cancel={() => (files = new DataTransfer().files)}>
	<Upload bind:files accept="video/x-matroska,.mkv" />
</FormDialog>

<style>
	.MediaActions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1em;
	}

	.action {
		border: var(--border-accent);
		background-color: var(--bg-normal);
		border-radius: 0.5em;
		padding: 0.4em 0.75em;
		text-decoration: none;
		color: inherit;
		cursor: pointer;

		&:hover {
			background-color: var(--bg-accent);
		}
	}
</style>
