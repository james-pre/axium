<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import * as format from 'utilium/format';
	import * as timers from './timers.svelte.ts';

	const dialogId = 'ai-timers';

	let dialog = $state<HTMLDialogElement>();
	let now = $state(Date.now());

	$effect(() => {
		if (!timers.running.size) return;
		const interval = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(interval);
	});

	const sorted = $derived(Array.from(timers.running.values()).sort((a, b) => a.ends.getTime() - b.ends.getTime()));

	$effect(() => {
		if (!sorted.length) dialog?.close();
	});

	function remaining(timer: ai.Timer): string {
		return format.duration(Math.max(Math.ceil((timer.ends.getTime() - now) / 1000), 0));
	}
</script>

{#snippet details(timer: ai.Timer)}
	<Icon i="stopwatch" />
	<span class="label">{timer.label ?? text('ai.timer.title')}</span>
	<span class="remaining">{remaining(timer)}</span>
{/snippet}

{#snippet cancel(timer: ai.Timer)}
	<button
		class="reset"
		title={text('ai.timer.cancel')}
		aria-label={text('ai.timer.cancel')}
		onclick={() => timers.cancel(timer.id).catch(error => toast('error', error))}
	>
		<Icon i="xmark" />
	</button>
{/snippet}

{#if sorted.length == 1}
	<div class="timer">
		{@render details(sorted[0])}
		{@render cancel(sorted[0])}
	</div>
{:else if sorted.length > 1}
	<button class="timer reset many" command="show-modal" commandfor={dialogId}>
		<Icon i="stopwatch" />
		<span class="label">{text('ai.timer.count', { count: sorted.length })}</span>
		<span class="remaining">{remaining(sorted[0])}</span>
		<Icon i="chevron-right" />
	</button>
{/if}

<dialog id={dialogId} bind:this={dialog}>
	<h3>{text('ai.timer.list')}</h3>
	<div class="list">
		{#each sorted as timer (timer.id)}
			<div class="timer">
				{@render details(timer)}
				{@render cancel(timer)}
			</div>
		{/each}
	</div>
	<button command="close" commandfor={dialogId}>{text('generic.done')}</button>
</dialog>

<style>
	.timer {
		display: flex;
		align-items: center;
		gap: 0.5em;
		background-color: var(--bg-alt);

		.label {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			text-align: start;
		}

		.remaining {
			font-variant-numeric: tabular-nums;
		}
	}

	.many {
		border: var(--border-accent);
		cursor: pointer;
	}

	dialog {
		width: 24em;

		h3 {
			margin-top: 0;
		}

		.list {
			display: flex;
			flex-direction: column;
			gap: 0.25em;
			max-height: 60vh;
			margin-bottom: 1em;
			overflow-y: auto;

			.timer {
				padding: 0.5em 1em;
				border-radius: 1.5em;
			}
		}
	}
</style>
