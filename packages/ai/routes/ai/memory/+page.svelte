<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { markdown } from '@axium/ai/markdown';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { confirm } from '@axium/client/dialogs';
	import { toast } from '@axium/client/toast';
	import MemoryForm from './MemoryForm.svelte';

	const { data } = $props();

	let memories = $state(data.memories.memories),
		adding = $state(false),
		editing = $state<string>();

	const { limit, maxLength } = data.memories;
	const userId = data.session.userId;

	function sort(list: ai.Memory[]): ai.Memory[] {
		return list.toSorted((a, b) => a.id.localeCompare(b.id));
	}

	async function add(values: { id: string; description: string; content: string }) {
		try {
			memories = sort([...memories, await fetchAPI('PUT', 'users/:id/ai/memories', values, userId)]);
			adding = false;
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}

	async function update(memory: ai.Memory, values: ai.MemoryUpdate) {
		try {
			const updated = await fetchAPI('PATCH', 'users/:id/ai/memories/:memory', values, userId, memory.id);
			memories = sort(memories.map(existing => (existing.id == memory.id ? updated : existing)));
			editing = undefined;
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}

	async function remove(memory: ai.Memory) {
		if (!(await confirm(text('ai.memory.delete_confirm', { id: memory.id }), { confirmText: text('ai.memory.delete'), danger: true })))
			return;
		try {
			await fetchAPI('DELETE', 'users/:id/ai/memories/:memory', {}, userId, memory.id);
			memories = memories.filter(existing => existing.id != memory.id);
		} catch (error) {
			toast('error', error);
		}
	}
</script>

<svelte:head>
	<title>{text('ai.memory.title')}</title>
</svelte:head>

<div class="memory-page">
	<div class="header">
		<h2>{text('ai.memory.title')}</h2>
		{#if !adding}
			<button class="icon-text" onclick={() => (adding = true)} disabled={memories.length >= limit}>
				<Icon i="plus" />
				<span>{text('ai.memory.add')}</span>
			</button>
		{/if}
	</div>

	<p class="subtle">{text('ai.memory.description')}</p>
	{#if !data.preferences.tools.memory}
		<p class="warning">{text('ai.memory.disabled')}</p>
	{/if}

	{#if adding}
		<div class="memory">
			<MemoryForm {maxLength} onsave={add} oncancel={() => (adding = false)} />
		</div>
	{/if}

	{#if !memories.length && !adding}
		<p class="subtle">{text('ai.memory.empty')}</p>
	{/if}

	<div class="list">
		{#each memories as memory (memory.id)}
			<div class="memory">
				{#if editing == memory.id}
					<MemoryForm {memory} {maxLength} onsave={values => update(memory, values)} oncancel={() => (editing = undefined)} />
				{:else}
					<div class="title">
						<span class="id">{memory.id}</span>
						<span class="buttons subtle">
							<button
								class="reset"
								title={text('ai.memory.edit')}
								aria-label={text('ai.memory.edit')}
								onclick={() => (editing = memory.id)}
							>
								<Icon i="pen" --size="14px" />
							</button>
							<button
								class="reset"
								title={text('ai.memory.delete')}
								aria-label={text('ai.memory.delete')}
								onclick={() => remove(memory)}
							>
								<Icon i="trash" --size="14px" />
							</button>
						</span>
					</div>
					{#if memory.content}
						<details>
							<summary>{memory.description}</summary>
							<div class="content" {@attach markdown(memory.content)}></div>
						</details>
					{:else}
						<div>{memory.description}</div>
					{/if}
					<div class="meta subtle">
						<span>{text(`ai.memory.source.${memory.source}`)}</span>
						<span>{memory.modified.toLocaleDateString()}</span>
						{#if memory.conversationId}
							<a href="/ai/{memory.conversationId}">{text('ai.memory.from_conversation')}</a>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.memory-page {
		display: flex;
		flex-direction: column;
		gap: 1em;
		max-width: 50em;
		margin: 0 auto;
		padding: 1em;
		height: 100%;
		overflow-y: auto;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 1em;

		h2 {
			margin: 0;
		}

		button {
			margin-left: auto;
		}
	}

	p {
		margin: 0;
	}

	.warning {
		color: var(--fg-warning);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.memory {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		padding: 0.75em 1em;
		border-radius: 0.75em;
		background-color: var(--bg-alt);
	}

	.title {
		display: flex;
		align-items: center;
		gap: 1em;

		.id {
			font-family: monospace;
			font-weight: bold;
		}

		.buttons {
			display: flex;
			gap: 0.75em;
			margin-left: auto;
		}
	}

	summary {
		cursor: pointer;
	}

	.content {
		margin-top: 0.5em;
		overflow-wrap: anywhere;

		:global(> :first-child) {
			margin-top: 0;
		}

		:global(> :last-child) {
			margin-bottom: 0;
		}
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
		font-size: 0.85em;
	}
</style>
