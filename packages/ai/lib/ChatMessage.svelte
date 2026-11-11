<script lang="ts" module>
	import { SvelteSet } from 'svelte/reactivity';

	/** IDs of messages whose reasoning the user expanded */
	const expanded = new SvelteSet<string>();
</script>

<script lang="ts">
	import type { AIMessage } from '@axium/ai/common';
	import { text } from '@axium/client';
	import { ClipboardCopy, Icon } from '@axium/client/components';
	import { markdown } from './markdown.js';

	const { message, onretry }: { message: AIMessage; onretry?(): void } = $props();

	const retryable = $derived(!!onretry && message.role == 'assistant' && message.status != 'pending');

	const pending = $derived(message.status == 'pending');

	const latestLine = $derived(
		message.reasoning
			?.split('\n')
			.map(line => line.replace(/[*_#`]/g, '').trim())
			.findLast(Boolean)
	);
</script>

<div class={['message', message.role]}>
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
	{:else if message.content}
		<div class="bubble text">{message.content}</div>
	{:else if pending && !message.reasoning}
		<div class="subtle">{text('ai.thinking')}</div>
	{/if}

	{#if message.status == 'error'}
		<div class="error">{text('ai.error', { error: message.error ?? '' })}</div>
	{/if}

	{#if !pending}
		<div class="actions subtle">
			{#if message.content}
				<ClipboardCopy value={message.content} --size="14px" />
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
	}

	.bubble {
		padding: 0.75em 1em;
		border-radius: 1em;
		background-color: var(--bg-alt);
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

		:global(pre) {
			padding: 0.75em 1em;
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
