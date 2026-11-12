<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import ModelOptions from './ModelOptions.svelte';
	import VoiceMode from './VoiceMode.svelte';
	import * as voice from './voice.svelte.js';

	let {
		generating = false,
		models,
		model = $bindable(),
		reasoning = $bindable(),
		onsend,
		onstop,
		onoptions,
		ctrlEnter = false,
	}: {
		generating?: boolean;
		/** Whether sending needs Ctrl+Enter, leaving Enter for new lines */
		ctrlEnter?: boolean;
		models: ai.Model[];
		model: string;
		reasoning: string;
		/** @param voice Whether the content was spoken in conversation mode */
		onsend(content: string, voice?: boolean): Promise<unknown>;
		onstop?(): void;
		/** Called after the model or reasoning changes */
		onoptions?(): void;
	} = $props();

	let content = $state(''),
		sending = $state(false),
		recording = $state<voice.Recording>(),
		transcribing = $state(false);

	async function startDictation() {
		try {
			recording = await voice.record();
		} catch (error) {
			toast('error', text('ai.voice.microphone_error', { error: error instanceof Error ? error.message : String(error) }));
		}
	}

	async function finishDictation() {
		if (!recording) return;
		const current = recording;
		recording = undefined;
		transcribing = true;
		try {
			const transcript = await voice.transcribe(await current.stop());
			if (transcript) content = content.trim() ? content.trimEnd() + ' ' + transcript : transcript;
		} catch (error) {
			toast('error', error);
		} finally {
			transcribing = false;
		}
	}

	function cancelDictation() {
		recording?.cancel();
		recording = undefined;
	}

	$effect(() => cancelDictation);

	$effect(() => voice.useSender(async spoken => void (await onsend(spoken, true))));

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
	{#if voice.conversation.active}
		<VoiceMode {generating} {onstop} />
	{:else}
		<textarea
			bind:value={content}
			placeholder={transcribing ? text('ai.voice.transcribing') : recording ? text('ai.voice.listening') : text('ai.placeholder')}
			onkeydown={e => {
				if (e.key == 'Escape' && recording) return cancelDictation();
				if (e.key != 'Enter' || e.shiftKey || e.isComposing) return;
				if (ctrlEnter && !e.ctrlKey && !e.metaKey) return;
				e.preventDefault();
				void send();
			}}
			{@attach dynamicRows(12, 1)}></textarea>
		<div class="controls">
			<ModelOptions {models} bind:model bind:reasoning onchange={onoptions} />
			{#if recording}
				<button
					type="button"
					class="reset cancel"
					title={text('ai.voice.cancel')}
					aria-label={text('ai.voice.cancel')}
					onclick={cancelDictation}
				>
					<Icon i="xmark" />
				</button>
				<button
					type="button"
					class="dictate recording"
					title={text('ai.voice.finish')}
					aria-label={text('ai.voice.finish')}
					onclick={finishDictation}
				>
					<Icon i="check" />
				</button>
			{:else if voice.available.dictation}
				{#if voice.available.speech}
					<button
						type="button"
						class="dictate"
						title={text('ai.voice.conversation')}
						aria-label={text('ai.voice.conversation')}
						onclick={voice.startConversation}
					>
						<Icon i="waveform-lines" />
					</button>
				{/if}
				<button
					type="button"
					class="dictate"
					title={text('ai.voice.dictate')}
					aria-label={text('ai.voice.dictate')}
					disabled={transcribing}
					onclick={startDictation}
				>
					<Icon i="microphone" />
				</button>
			{/if}
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
	{/if}
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
		view-transition-name: ai-composer;
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

	.dictate {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5em;
		border-radius: 0.5em;
		border: none;
		background: none;

		&.recording {
			background-color: var(--bg-error);
			animation: pulse 1.5s ease-in-out infinite;
		}

		&:disabled {
			opacity: 50%;
		}
	}

	.cancel {
		opacity: 69%;
	}

	@keyframes pulse {
		50% {
			opacity: 60%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dictate.recording {
			animation: none;
		}
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
