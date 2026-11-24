<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { forPath } from '@axium/core/icons';
	import { bytes as formatBytes } from 'utilium/format';
	import { downloadURL } from './sandbox.js';

	const { conversationId }: { conversationId: string } = $props();

	const dialogId = $derived('ai-sandbox-files-' + conversationId);

	let listing = $state<ai.SandboxFiles>(),
		error = $state<string>(),
		loading = $state(false);

	async function load() {
		loading = true;
		error = undefined;
		try {
			listing = await fetchAPI('GET', 'ai/sandbox/:id', {}, conversationId);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			loading = false;
		}
	}
</script>

<button
	class="reset files"
	command="show-modal"
	commandfor={dialogId}
	title={text('ai.sandbox.files')}
	aria-label={text('ai.sandbox.files')}
	onclick={load}
>
	<Icon i="folder-open" />
</button>

<dialog id={dialogId}>
	<h3>{text('ai.sandbox.files')}</h3>
	{#if error}
		<p class="error">{error}</p>
	{:else if loading && !listing}
		<p class="subtle">{text('ai.sandbox.loading')}</p>
	{:else if !listing?.files.length}
		<p class="subtle">{text('ai.sandbox.empty')}</p>
	{:else}
		<div class="list">
			{#each listing.files as file (file.path)}
				<a class="file" href={downloadURL(conversationId, file.path)} download={file.path.split('/').at(-1)}>
					<Icon i={forPath(file.path)} --size="14px" />
					<span class="path">{file.path}</span>
					<span class="subtle">{formatBytes(file.size)}</span>
					<Icon i="download" --size="14px" />
				</a>
			{/each}
		</div>
		{#if listing.truncated}
			<p class="subtle">{text('ai.sandbox.truncated', { count: listing.files.length })}</p>
		{/if}
	{/if}
	<button command="close" commandfor={dialogId}>{text('generic.done')}</button>
</dialog>

<style>
	.files {
		display: inline-flex;
		padding: 0.25em;
	}

	dialog {
		width: min(32em, 90vw);

		h3 {
			margin-top: 0;
		}
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		max-height: 60vh;
		margin-bottom: 1em;
		overflow-y: auto;
	}

	.file {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.5em 0.75em;
		border-radius: 0.5em;
		color: inherit;
		text-decoration: none;

		&:hover {
			background-color: var(--bg-alt);
		}

		.path {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.error {
		color: var(--fg-error);
	}
</style>
