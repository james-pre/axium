<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { fetchAPI, text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';

	const { model, onremove }: { model: ai.Model; onremove?(): void } = $props();

	let confirmDelete = $state<HTMLDialogElement>();
	let busy = $state(false);

	async function act(action: 'load' | 'unload' | 'pause' | 'resume') {
		busy = true;
		try {
			await fetchAPI('POST', 'ai/models/:id', { action }, model.id);
		} catch (error) {
			toast('error', error);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		await fetchAPI('DELETE', 'ai/models/:id', {}, model.id);
		toast('success', text('ai.model_deleted', { name: model.name }));
		onremove?.();
	}
</script>

<div class="ModelActions">
	{#if model.status == 'downloading'}
		<button class="icon-text" disabled={busy} onclick={() => act('pause')}>
			<Icon i="pause" />
			<span>{text('ai.action.pause')}</span>
		</button>
	{:else if model.status == 'incomplete'}
		<button class="icon-text" disabled={busy} onclick={() => act('resume')}>
			<Icon i="play" />
			<span>{text('ai.action.resume')}</span>
		</button>
	{:else if model.status == 'loaded' || model.status == 'sleeping' || model.status == 'loading'}
		<button class="icon-text" disabled={busy} onclick={() => act('unload')}>
			<Icon i="eject" />
			<span>{text('ai.action.unload')}</span>
		</button>
	{:else if model.status == 'unloaded'}
		<button class="icon-text" disabled={busy} onclick={() => act('load')}>
			<Icon i="upload" />
			<span>{text('ai.action.load')}</span>
		</button>
	{/if}
	<button class="icon-text danger" onclick={() => confirmDelete?.showModal()}>
		<Icon i="trash" />
		<span>{text('generic.delete')}</span>
	</button>
</div>

<FormDialog bind:dialog={confirmDelete} submit={remove} submitText={text('generic.delete')} submitDanger>
	{#snippet header()}
		<h3>{text('ai.delete_title', { name: model.name })}</h3>
	{/snippet}
	<p>{text('ai.delete_body')}</p>
</FormDialog>

<style>
	.ModelActions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}
</style>
