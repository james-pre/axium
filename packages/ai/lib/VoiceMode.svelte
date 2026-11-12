<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import * as voice from './voice.svelte.js';

	const {
		generating = false,
		onstop,
	}: {
		generating?: boolean;
		/** Stops the response being generated */
		onstop?(): void;
	} = $props();

	const { conversation } = voice;

	const icons: Record<voice.Phase, string> = {
		idle: 'microphone',
		listening: 'waveform-lines',
		transcribing: 'ellipsis',
		responding: 'ellipsis',
		speaking: 'volume-high',
	};

	function press() {
		const interrupting = conversation.phase == 'responding' || conversation.phase == 'speaking';
		if (interrupting && generating) onstop?.();
		voice.toggle();
	}
</script>

<div class="VoiceMode">
	<button
		type="button"
		class={['talk', conversation.phase]}
		style:--level={conversation.level}
		title={text(`ai.voice.action.${conversation.phase}`)}
		aria-label={text(`ai.voice.action.${conversation.phase}`)}
		disabled={conversation.phase == 'transcribing'}
		onclick={press}
	>
		<Icon i={icons[conversation.phase]} --size="1.75em" />
	</button>
	<div class="status" aria-live="polite">
		{#if conversation.error}
			<span class="error">{conversation.error}</span>
		{:else}
			<span>{text(`ai.voice.phase.${conversation.phase}`)}</span>
		{/if}
	</div>
	<button type="button" class="end icon-text" onclick={voice.endConversation}>
		<Icon i="xmark" />
		<span>{text('ai.voice.end')}</span>
	</button>
</div>

<style>
	.VoiceMode {
		display: flex;
		align-items: center;
		gap: 1em;
	}

	.talk {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4em;
		height: 4em;
		border-radius: 50%;
		border: none;
		background-color: var(--bg-accent);
		--shadow-color: var(--bg-accent);
		box-shadow: 0 0 0 calc(var(--level, 0) * 0.75em) color-mix(in srgb, var(--shadow-color) 50%, transparent);
		transition: box-shadow 0.1s;

		&.listening {
			background-color: var(--bg-error);
			--shadow-color: var(--bg-error);
		}

		&.transcribing,
		&.responding {
			animation: pulse 1.5s ease-in-out infinite;
		}

		&:disabled {
			cursor: progress;
		}
	}

	.status {
		flex: 1;
		min-width: 0;

		.error {
			color: var(--fg-error);
		}
	}

	@keyframes pulse {
		50% {
			opacity: 60%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.talk {
			animation: none !important;
			transition: none;
		}
	}
</style>
