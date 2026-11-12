<script lang="ts" module>
	import { SvelteSet } from 'svelte/reactivity';

	/** IDs of messages whose reasoning the user expanded */
	const expanded = new SvelteSet<string>();
</script>

<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { ClipboardCopy, Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { markdown } from './markdown.js';
	import * as voice from './voice.svelte.js';
	import ToolCall from './ToolCall.svelte';

	const {
		message,
		ctrlEnter = false,
		results,
		decisions,
		onretry,
		onedit,
		ondecide,
	}: {
		message: ai.Message;
		/** Whether saving an edit needs Ctrl+Enter, leaving Enter for new lines */
		ctrlEnter?: boolean;
		/** Tool messages, by the ID of the call they answer */
		results?: Map<string, ai.Message>;
		/** Choices for calls awaiting approval, before they are sent */
		decisions?: ai.Decisions;
		onretry?(): void;
		/** Replaces the message's content */
		onedit?(content: string): Promise<unknown>;
		ondecide?(call: ai.ToolCall, decision: ai.Decision): void;
	} = $props();

	let draft = $state<string>();
	let saving = $state(false);

	async function save() {
		if (!onedit || !draft?.trim() || draft.trim() == message.content || saving) return;
		saving = true;
		try {
			await onedit(draft);
			draft = undefined;
		} finally {
			saving = false;
		}
	}

	const retryable = $derived(!!onretry && message.role == 'assistant' && message.status != 'pending');

	const pending = $derived(message.status == 'pending');

	const latestLine = $derived(
		message.reasoning
			?.split('\n')
			.map(line => line.replace(/[*_#`]/g, '').trim())
			.findLast(Boolean)
	);
</script>

<div class={['message', message.role, draft !== undefined && 'editing']}>
	{#if draft !== undefined}
		<form
			class="edit"
			onsubmit={e => {
				e.preventDefault();
				void save();
			}}
		>
			<textarea
				bind:value={draft}
				onkeydown={e => {
					if (e.key == 'Escape') draft = undefined;
					if (e.key != 'Enter' || e.shiftKey || e.isComposing) return;
					if (ctrlEnter && !e.ctrlKey && !e.metaKey) return;
					e.preventDefault();
					void save();
				}}
				{@attach element => element.focus()}
				{@attach dynamicRows(20, 1)}></textarea>
			<div class="edit-actions">
				<button type="button" onclick={() => (draft = undefined)}>{text('generic.cancel')}</button>
				<button type="submit" class="send" disabled={saving || !draft.trim() || draft.trim() == message.content}>
					{text('ai.send')}
				</button>
			</div>
		</form>
	{/if}

	{#if message.reasoning}
		<details
			class="reasoning"
			open={expanded.has(message.id)}
			ontoggle={e => (e.currentTarget.open ? expanded.add(message.id) : expanded.delete(message.id))}
		>
			<summary class="subtle">
				<span class="label">{pending && !message.content ? text('ai.thinking') : text('ai.reasoning')}</span>
				<span class="latest">{latestLine}</span>
			</summary>
			<div class="text">{message.reasoning}</div>
		</details>
	{/if}

	{#if message.content && message.role == 'assistant'}
		<div class="markdown" {@attach markdown(message.content)}></div>
	{:else if message.content && draft === undefined}
		<div class="bubble text">{message.content}</div>
	{:else if pending && !message.reasoning}
		<div class="subtle">{text('ai.thinking')}</div>
	{/if}

	{#each message.toolCalls ?? [] as call (call.id)}
		<ToolCall {call} result={results?.get(call.id)} decision={decisions?.[call.id]} ondecide={decision => ondecide?.(call, decision)} />
	{/each}

	{#if message.status == 'error'}
		<div class="error">{text('ai.error', { error: message.error ?? '' })}</div>
	{/if}

	{#if !pending && draft === undefined && (message.content || retryable || message.status != 'done')}
		<div class="actions subtle">
			{#if message.content}
				<ClipboardCopy value={message.content} --size="14px" />
			{/if}
			{#if message.content && message.role == 'assistant' && voice.available.speech}
				{const speaking = $derived(voice.speaking() == message.id)}
				<button
					class="reset"
					title={text(speaking ? 'ai.voice.stop_speaking' : 'ai.voice.speak')}
					aria-label={text(speaking ? 'ai.voice.stop_speaking' : 'ai.voice.speak')}
					onclick={() => {
						if (speaking) voice.stopSpeaking();
						else voice.speak(message.id, message.content).catch(error => toast('error', error));
					}}
				>
					<Icon i={speaking ? 'stop' : 'volume-high'} --size="14px" />
				</button>
			{/if}
			{#if onedit}
				<button class="reset" title={text('ai.edit')} aria-label={text('ai.edit')} onclick={() => (draft = message.content)}>
					<Icon i="pen" --size="14px" />
				</button>
			{/if}
			{#if retryable && message.status == 'done'}
				<button class="reset retry" title={text('ai.retry')} aria-label={text('ai.retry')} onclick={onretry}>
					<Icon i="arrow-rotate-right" --size="14px" />
				</button>
			{:else if retryable}
				<button class="retry icon-text" onclick={onretry}>
					<Icon i="arrow-rotate-right" --size="14px" />
					<span>{text('ai.retry')}</span>
				</button>
			{/if}
			{#if message.status == 'cancelled'}
				<span>{text('ai.stopped')}</span>
			{:else if message.usage?.generationSpeed}
				<span>{text('ai.speed', { speed: message.usage.generationSpeed.toFixed(1) })}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.message {
		display: flex;
		flex-direction: column;
		gap: 0.5em;

		&.user {
			align-self: flex-end;
			align-items: flex-end;
			max-width: 80%;
		}

		&.user.editing {
			align-self: stretch;
			max-width: none;
		}
	}

	.bubble {
		padding: 0.75em 1em;
		border-radius: 1em;
		background-color: var(--bg-alt);
	}

	.edit {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		width: 100%;
		padding: 0.75em 1em;
		border-radius: 1em;
		background-color: var(--bg-alt);

		textarea {
			border: none;
			background: none;
			padding: 0;
		}
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5em;

		.send {
			background-color: var(--bg-accent);
		}
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1em;
		font-size: 0.8em;
		min-height: 1.5em;
	}

	@media (hover: hover) {
		.message.user .actions {
			visibility: hidden;
		}

		.message.user:hover .actions {
			visibility: visible;
		}

		.markdown :global(.code-block:not(:hover) .code-copy) {
			visibility: hidden;
		}
	}

	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.markdown {
		overflow-wrap: anywhere;

		:global(> :first-child) {
			margin-top: 0;
		}

		:global(> :last-child) {
			margin-bottom: 0;
		}

		:global(.code-block) {
			position: relative;
			margin: 1em 0;
		}

		:global(.code-copy) {
			position: absolute;
			top: 0.6em;
			right: 0.75em;
			font-size: 0.9em;
		}

		:global(pre) {
			margin: 0;
			padding: 0.75em 2.5em 0.75em 1em;
			border-radius: 0.5em;
			background-color: var(--bg-alt);
			overflow-x: auto;
			overflow-wrap: normal;
		}

		:global(pre code) {
			padding: 0;
			background: none;
		}

		:global(table) {
			border-collapse: collapse;
		}

		:global(th),
		:global(td) {
			padding: 0.25em 0.75em;
			border: 1px solid var(--bg-strong);
		}

		:global(blockquote) {
			margin-left: 0;
			padding-left: 1em;
			border-left: 2px solid var(--bg-strong);
		}
	}

	.reasoning .text {
		padding-left: 1em;
		border-left: 2px solid var(--bg-strong);
		font-size: 0.9em;
		opacity: 0.8;
	}

	summary {
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		.latest {
			margin-left: 0.5em;
			opacity: 0.7;
		}
	}

	details[open] .latest {
		display: none;
	}

	.reasoning .text {
		margin-top: 0.5em;
	}

	.error {
		color: var(--fg-error);
	}
</style>
