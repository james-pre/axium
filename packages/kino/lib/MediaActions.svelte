<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { formatBytes } from '@axium/core/format';
	import { mediaAccept, type KinoUpload } from '@axium/kino/common';

	interface Props {
		/** The upload backing this movie/episode, or nullish when nothing has been uploaded */
		upload?: KinoUpload | null;
		/** Where the "watch" button links to */
		watchHref: string;
		/** The `/raw` URL the file is downloaded from */
		dataURL: string;
		/** Label for the upload button */
		uploadText: string;
		/** Whether the current user may delete the upload */
		canDelete?: boolean;
		/** Performs the upload, resolving with the new upload once it finishes */
		uploadFile(file: File): Promise<KinoUpload | undefined>;
		/** Deletes the upload and its files */
		deleteUpload?(): Promise<unknown>;
	}

	let { upload = $bindable(), watchHref, dataURL, uploadText, canDelete, uploadFile, deleteUpload }: Props = $props();

	let input = $state<HTMLInputElement>();
	let deleteDialog = $state<HTMLDialogElement>();

	function onPicked(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];

		// Clear it so picking the same file again still fires a change event
		event.currentTarget.value = '';

		if (!file) return;

		// Progress is reported by a toast, so there is nothing to wait on here
		void uploadFile(file).then(result => {
			if (result) upload = result;
		});
	}

	async function confirmDelete() {
		try {
			await deleteUpload!();
			upload = null;
			void toast('success', text('kino.delete_success'));
		} catch (e) {
			void toast('error', e);
		}
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
		{#if canDelete && deleteUpload}
			<button class="icon-text danger" onclick={() => deleteDialog?.showModal()}>
				<Icon i="trash" />
				{text('kino.delete')}
			</button>
		{/if}
		<span class="subtle">
			{text('kino.uploaded_detail', { date: upload.uploadedAt.toLocaleDateString(), size: formatBytes(upload.size) })}
		</span>
	{:else}
		<button class="icon-text" onclick={() => input?.click()}>
			<Icon i="upload" />
			{uploadText}
		</button>
		<span class="subtle">{text('kino.not_uploaded')}</span>
	{/if}

	<input bind:this={input} type="file" accept={mediaAccept} onchange={onPicked} hidden />
</div>

<FormDialog bind:dialog={deleteDialog} submitText={text('kino.delete')} submitDanger submit={confirmDelete}>
	<span>{text('kino.delete_confirm')}</span>
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
