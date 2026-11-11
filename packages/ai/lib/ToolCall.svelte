<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';

	const {
		call,
		result,
		decision,
		ondecide,
	}: {
		call: ai.ToolCall;
		/** The call's tool message, once it exists */
		result?: ai.Message;
		/** The user's choice while other calls still await one */
		decision?: ai.Decision;
		ondecide?(decision: ai.Decision): void;
	} = $props();

	const choices = ['deny', 'once', 'chat', 'always'] as const satisfies ai.Decision[];

	const status = $derived(result?.status ?? 'pending');

	const icons: Record<ai.MessageStatus, string> = {
		pending: 'spinner-third',
		done: 'check',
		error: 'xmark',
		cancelled: 'ban',
		awaiting: 'hand',
	};

	const input = $derived.by((): unknown => {
		try {
			return JSON.parse(call.arguments || '{}');
		} catch {
			return call.arguments;
		}
	});

	/** The first text in the input, e.g. the URL being read */
	const preview = $derived(input && typeof input == 'object' ? Object.values(input).find(value => typeof value == 'string') : undefined);

	/** Characters of a result shown */
	const maxShown = 4000;

	function pretty(value: string): string {
		let shown: string;
		try {
			shown = JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			shown = value;
		}
		return shown.length > maxShown ? shown.slice(0, maxShown) + '\n…' : shown;
	}
</script>

<div class={['ToolCall', status]}>
	<details open={status == 'awaiting'}>
		<summary>
			<Icon i={icons[status]} --size="14px" class={status == 'pending' ? 'spin' : undefined} />
			<span class="name">{text(`ai.tool.${call.name}`, { $default: call.name })}</span>
			{#if preview}<span class="preview subtle">{preview}</span>{/if}
		</summary>
		<div class="details">
			<span class="subtle">{text('ai.tool_input')}</span>
			<pre>{typeof input == 'string' ? input : JSON.stringify(input, null, 2)}</pre>
			{#if result?.status == 'done'}
				<span class="subtle">{text('ai.tool_result')}</span>
				<pre>{pretty(result.content)}</pre>
			{/if}
		</div>
	</details>

	{#if result?.status == 'error' && result.error}
		<div class="error">{result.error}</div>
	{/if}

	{#if status == 'awaiting'}
		<div class="approval">
			<span>{text('ai.tool_awaiting')}</span>
			{#each choices as choice}
				<button class={[choice != 'deny' && 'approve', decision == choice && 'chosen']} onclick={() => ondecide?.(choice)}>
					{text(`ai.tool_decision.${choice}`)}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ToolCall {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		padding: 0.5em 0.75em;
		border-radius: 0.75em;
		border: var(--border-accent);
		font-size: 0.9em;

		&.awaiting {
			border: var(--border-strong);
		}
	}

	summary {
		display: flex;
		align-items: center;
		gap: 0.5em;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;

		.preview {
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		margin-top: 0.5em;
	}

	pre {
		margin: 0 0 0.5em;
		padding: 0.5em 0.75em;
		border-radius: 0.5em;
		background-color: var(--bg-alt);
		max-height: 20em;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.approval {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;

		span {
			flex: 1;
		}

		.chosen {
			border: var(--border-strong);
		}

		.approve {
			background-color: var(--bg-accent);
		}
	}

	.error {
		color: var(--fg-error);
	}

	@media not (prefers-reduced-motion) {
		.ToolCall :global(.spin) {
			animation: spin 1s linear infinite;
		}
	}

	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
</style>
