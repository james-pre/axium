<script lang="ts">
	import * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { ProgressBar, ProgressRing } from '@axium/client/components';

	const {
		load,
		refresh,
		models,
		admin = false,
	}: {
		load(query: ai.ContextQuery): Promise<ai.ContextUsage>;
		/** Usage is loaded again when this changes; `undefined` while a response is being generated */
		refresh: unknown;
		models: ai.Model[];
		/** Shows the system prompt */
		admin?: boolean;
	} = $props();

	const dialogId = $props.id();

	let usage = $state<ai.ContextUsage>(),
		parts = $state<ai.ContextUsage['parts']>(),
		counting = $state(false),
		error = $state<string>();

	$effect(() => {
		if (refresh === undefined) return;
		let current = true;
		load({})
			.then(result => {
				if (!current) return;
				usage = result;
				parts = undefined;
			})
			.catch(() => {});
		return () => (current = false);
	});

	async function count() {
		counting = true;
		error = undefined;
		try {
			usage = await load({ parts: true, prompt: admin });
			parts = usage.parts;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			counting = false;
		}
	}

	const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

	const fraction = $derived(usage?.used !== undefined && usage.limit ? usage.used / usage.limit : undefined);
	const modelName = $derived(models.find(model => model.id == usage?.model)?.name ?? usage?.model ?? '');

	/** e.g. `12.3K/65.5K` */
	const amount = $derived(
		usage?.used === undefined
			? ''
			: usage.limit
				? `${compact.format(usage.used)}/${compact.format(usage.limit)}`
				: compact.format(usage.used)
	);

	/** What bars in the breakdown are relative to */
	const scale = $derived(usage?.limit ?? usage?.used ?? 1);
</script>

{#if usage?.used !== undefined}
	<button class="reset meter" command="show-modal" commandfor={dialogId} title={amount} onclick={count}>
		<ProgressRing value={fraction ?? 0} --size="1em" />
		<span>{fraction === undefined ? compact.format(usage.used) : percent.format(fraction)}</span>
	</button>
{/if}

<dialog id={dialogId}>
	<h3>{text('ai.context.title')}</h3>

	{#if usage?.used !== undefined}
		<p>
			{amount}
			{#if fraction !== undefined}<span class="subtle">({percent.format(fraction)})</span>{/if}
		</p>
		{#if fraction !== undefined}<ProgressBar value={fraction} />{/if}
	{/if}

	{#if error}
		<p class="error">{error}</p>
	{:else if counting && !parts}
		<p class="subtle">{text('ai.context.counting')}</p>
	{:else if parts}
		<div class="parts">
			{#each ai.contextParts as part (part)}
				{const tokens = parts[part]}
				{#if tokens}
					<div class="part">
						<span>{text(`ai.context.part.${part}`)}</span>
						<span class="tokens">{compact.format(tokens)}</span>
						<ProgressBar value={tokens / scale} />
					</div>
				{/if}
			{/each}
		</div>
	{:else if usage && !usage.counted}
		<p class="subtle">{text('ai.context.not_loaded', { model: modelName })}</p>
	{/if}

	{#if usage?.prompt}
		<details class="prompt">
			<summary>{text('ai.context.system_prompt')}</summary>
			<pre>{usage.prompt}</pre>
		</details>
	{/if}

	<button command="close" commandfor={dialogId}>{text('generic.done')}</button>
</dialog>

<style>
	.meter {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		font-size: 0.85em;
		font-variant-numeric: tabular-nums;
	}

	dialog {
		width: min(28em, 90vw);

		h3 {
			margin-top: 0;
		}
	}

	.parts {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		margin: 1em 0;
	}

	.part {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.2em 1em;

		:global(.ProgressBar) {
			grid-column: 1 / -1;
		}

		.tokens {
			font-variant-numeric: tabular-nums;
		}
	}

	.prompt {
		margin-bottom: 1em;

		summary {
			cursor: pointer;
		}

		pre {
			max-height: 50vh;
			overflow-y: auto;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			padding: 0.75em 1em;
			border-radius: 0.5em;
			background-color: var(--bg-alt);
			font-size: 0.85em;
		}
	}

	.error {
		color: var(--fg-error);
	}
</style>
