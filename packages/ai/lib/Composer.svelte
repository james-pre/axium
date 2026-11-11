<script lang="ts">
	import type { AIModel } from '@axium/ai/common';
	import { text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { Icon } from '@axium/client/components';
	import ModelOptions from './ModelOptions.svelte';

	let {
		generating = false,
		models,
		model = $bindable(),
		reasoning = $bindable(),
		onsend,
		onstop,
		onoptions,
	}: {
		generating?: boolean;
		models: AIModel[];
		model: string;
		reasoning: string;
		onsend(content: string): Promise<unknown>;
		onstop?(): void;
		/** Called after the model or reasoning changes */
		onoptions?(): void;
	} = $props();

	let content = $state('');
	let sending = $state(false);

	async function send() {
		if (!content.trim() || generating || sending) return;
		sending = true;
		try {
			await onsend(content);
			content = '';
		} finally {
			sending = false;
		}
	}
</script>

<form
	class="composer"
	onsubmit={e => {
		e.preventDefault();
		void send();
	}}
>
	<textarea
		bind:value={content}
		placeholder={text('ai.placeholder')}
		onkeydown={e => {
			// @todo make this a user preference (needing Ctrl+Enter to submit)
			if (e.key != 'Enter' || e.shiftKey || e.isComposing) return;
			e.preventDefault();
			void send();
		}}
		{@attach dynamicRows(12, 1)}></textarea>
	<div class="controls">
		<ModelOptions {models} bind:model bind:reasoning onchange={onoptions} />
		{#if generating}
			<button type="button" class="send" title={text('ai.stop')} onclick={() => onstop?.()}>
				<Icon i="stop" />
			</button>
		{:else}
			<button type="submit" class="send" title={text('ai.send')} disabled={sending || !content.trim()}>
				<Icon i="arrow-up" />
			</button>
		{/if}
	</div>
</form>

<style>
	.composer {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		padding: 0.75em 0.75em 0.75em 1em;
		border-radius: 1.25em;
		background-color: var(--bg-alt);
		max-width: 50em;
		width: 100%;
	}

	textarea {
		border: none;
		background: none;
		padding: 0.25em 0;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75em;
	}

	.send {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5em;
		border-radius: 0.5em;
		background-color: var(--bg-accent);
	}
</style>
