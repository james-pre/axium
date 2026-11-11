<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { ProgressBar } from '@axium/client/components';
	import { bytes } from 'utilium/format';

	const { model }: { model: ai.Model } = $props();

	const fraction = $derived(model.progress?.total ? model.progress.done / model.progress.total : null);
</script>

<div class={['ModelStatus', model.status]}>
	<span class="label">
		{text(`ai.status.${model.status}`)}
		{#if model.failed && model.status == 'unloaded'}
			<span class="failed">{text('ai.load_failed')}</span>
		{/if}
	</span>
	{#if model.status == 'downloading' || model.status == 'incomplete'}
		<ProgressBar value={model.status == 'downloading' ? fraction : (fraction ?? 0)} />
		{#if model.progress?.total}
			<span class="subtle">{bytes(model.progress.done)} / {bytes(model.progress.total)}</span>
		{/if}
	{/if}
</div>

<style>
	.ModelStatus {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}

	.loaded .label,
	.sleeping .label {
		color: var(--fg-accent);
	}

	.unavailable .label,
	.failed {
		color: var(--fg-error);
	}

	.failed {
		margin-left: 0.5em;
		font-size: 0.85em;
	}
</style>
