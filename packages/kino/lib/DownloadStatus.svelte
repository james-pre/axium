<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, ProgressRing } from '@axium/client/components';
	import { cancelDownload, selectDownloadFile } from '@axium/kino/client';
	import type { KinoDownload } from '@axium/kino/common';
	import { bytes, duration } from 'utilium/format';
	import { downloads } from './downloads.svelte.js';

	interface Props {
		download: KinoDownload;
		/** Whether the current user started the download or is an administrator */
		canManage?: boolean;
	}

	const { download, canManage }: Props = $props();

	let cancelDialog = $state<HTMLDialogElement>(),
		pickDialog = $state<HTMLDialogElement>();

	const measured = $derived(download.state == 'downloading');

	const detail = $derived.by(() => {
		const values = {
			downloaded: bytes(download.downloaded),
			size: bytes(download.size),
			rate: bytes(Math.round(download.downloadRate)),
		};

		return download.remaining === null
			? text('kino.torrent.detail_without_estimate', values)
			: text('kino.torrent.detail', { ...values, remaining: duration(download.remaining) });
	});

	async function cancel() {
		await cancelDownload(download.hash);
		downloads.delete(download.hash);
	}
</script>

<div class="DownloadStatus">
	{#if download.state == 'failed'}
		<span class="icon-text error">
			<Icon i="triangle-exclamation" />
			{text('kino.torrent.state.failed')}
		</span>
		{#if canManage}
			<button onclick={cancel}>{text('kino.torrent.dismiss')}</button>
		{/if}
		<span class="subtle">{download.error}</span>
	{:else}
		{#if download.state == 'selecting' && canManage}
			<button class="icon-text" onclick={() => pickDialog?.showModal()}>
				<Icon i="list-check" />
				{text('kino.torrent.pick')}
			</button>
		{:else}
			<span class="icon-text">
				<ProgressRing value={measured ? download.progress : null} />
				{text(`kino.torrent.state.${download.state}`)}
			</span>
		{/if}

		{#if canManage}
			<button class="reset cancel" title={text('kino.torrent.cancel')} onclick={() => cancelDialog?.showModal()}>
				<Icon i="xmark" />
			</button>
		{/if}

		{#if measured}
			<span class="subtle">{detail}</span>
		{/if}
	{/if}
</div>

<FormDialog bind:dialog={cancelDialog} submitText={text('kino.torrent.cancel')} submitDanger submit={cancel}>
	<span>{text('kino.torrent.cancel_confirm')}</span>
</FormDialog>

<FormDialog
	bind:dialog={pickDialog}
	submitText={text('kino.torrent.pick_submit')}
	submit={async ({ index }) => {
		Object.assign(download, await selectDownloadFile(download.hash, Number(index)));
	}}
>
	{#snippet header()}
		<h3>{text('kino.torrent.pick_title')}</h3>
	{/snippet}

	<span class="subtle">{text('kino.torrent.pick_hint')}</span>

	<div class="choices">
		{#each download.choices ?? [] as choice (choice.index)}
			<label>
				<input type="radio" name="index" value={choice.index} required />
				<span class="path">{choice.path}</span>
				<span class="subtle">{bytes(choice.size)}</span>
			</label>
		{/each}
	</div>
</FormDialog>

<style>
	.DownloadStatus {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1em;
	}

	.cancel {
		display: contents;
		cursor: pointer;
	}

	.error {
		--fill: var(--fg-error);
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		max-height: 60vh;
		overflow-y: auto;

		label {
			display: flex;
			align-items: center;
			gap: 0.5em;
		}

		.path {
			flex: 1;
			overflow-wrap: anywhere;
		}
	}
</style>
