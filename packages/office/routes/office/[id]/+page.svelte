<script lang="ts">
	import { text } from '@axium/client';
	import { Icon, InlineEdit, TopBarContent } from '@axium/client/components';
	import { toastStatus } from '@axium/client/toast';
	import { updateItemMetadata } from '@axium/storage/client';
	import Editor, { type EditorStatus } from './Editor.svelte';

	const { data } = $props();

	const { editor, readOnly, canRename } = $derived(data);

	let item = $derived(data.item),
		renaming = $state(false),
		status = $state<EditorStatus>('loading');

	function rename(name: string) {
		toastStatus(
			updateItemMetadata(item.id, { name }).then(() => (item = { ...item, name })),
			text('office.renamed')
		);
	}

	const onstatus = (next: EditorStatus) => (status = next);
</script>

<svelte:head>
	<title>{item.name}</title>
</svelte:head>

<TopBarContent name={text('app_name.office')} icon="file-pen" href="/office" align="left">
	<div class="document-name">
		{#if renaming}
			{const dot = $derived(item.name.lastIndexOf('.'))}
			<InlineEdit
				value={item.name}
				selectionRange={[0, dot > 0 ? dot : item.name.length]}
				confirmLabel={text('generic.rename')}
				commit={rename}
				close={() => (renaming = false)}
			/>
		{:else if canRename}
			<button class="reset name" title={text('generic.rename')} onclick={() => (renaming = true)}>{item.name}</button>
		{:else}
			<span class="name">{item.name}</span>
		{/if}
		{#if readOnly}
			<span class="read-only icon-text"><Icon i="lock" />{text('office.read_only')}</span>
		{/if}
	</div>
</TopBarContent>

<div class="editor">
	<Editor {editor} {onstatus} />

	{#if status != 'ready'}
		<div class="status" role="status">
			{#if status == 'loading'}
				<span>{text('office.opening', { name: item.name })}</span>
			{:else}
				<span>{text('office.failed')}</span>
				{#if status == 'unreachable'}
					{const origin = $derived(new URL(editor.url).origin)}
					<span>
						{text('office.trust_hint')}
						<a href={origin} target="_blank">{origin}</a>
					</span>
				{/if}
				<a href="/office">{text('office.back')}</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.document-name {
		display: flex;
		align-items: center;
		gap: 1em;
		min-width: 0;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 1.1em;
		padding: 0.25em 0.5em;
		border-radius: 0.5em;
	}

	button.name:hover {
		background-color: var(--bg-strong);
		cursor: text;
	}

	.read-only {
		flex-shrink: 0;
		gap: 0.5em;
		font-size: 0.85em;
		color: var(--fg-accent);
	}

	.editor {
		position: fixed;
		inset: var(--top-bar-height) 0 0;
	}

	.status {
		position: absolute;
		inset: 0;
		margin: auto;
		width: fit-content;
		height: fit-content;
		max-width: min(32em, calc(100% - 2em));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75em;
		padding: 1.5em 2em;
		text-align: center;
		overflow-wrap: anywhere;
		border-radius: 1em;
		border: var(--border-elevated);
		background-color: var(--bg-elevated);
	}
</style>
