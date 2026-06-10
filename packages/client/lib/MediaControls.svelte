<script lang="ts">
	import { formatDuration } from '@axium/core';
	import Icon from './Icon.svelte';
	import type { MediaState } from './media.svelte.js';
	import type { Snippet } from 'svelte';

	interface Props {
		media: MediaState;
		children?: Snippet;
	}

	const { media, children }: Props = $props();
</script>

<div class="MediaControls">
	<button class="reset icon-text" onclick={media.click}>
		<Icon i={media.ended ? 'arrow-rotate-right' : media.paused ? 'play' : 'pause'} />
	</button>
	<div class="timeline">
		<div class="timeline-track">
			{#each media.buffered || [] as { start, end }}
				<div
					class="buffered-range"
					style:left="{(start / (media.duration || 1)) * 100}%"
					style:width="{((end - start) / (media.duration || 1)) * 100}%"
				></div>
			{/each}
			<div class="played-range" style:width="{(media.currentTime / (media.duration || 1)) * 100}%"></div>
		</div>
		<div class="timeline-thumb" style:left="{(media.currentTime / (media.duration || 1)) * 100}%">
			<Icon i="pipe" />
		</div>
		<input class="seek-input" type="range" min="0" max={media.duration || 1} step="0.01" bind:value={media.currentTime} />
	</div>
	<div class="times">
		<span>{formatDuration(media.currentTime)}</span>
		<span>/</span>
		<span>{formatDuration(media.duration)}</span>
	</div>
	<button class="reset icon-text volume" onclick={() => (media.muted = !media.muted)}>
		<Icon i={media.muted || !media.volume ? 'volume-slash' : 'volume'} />
	</button>
	<div class="volume-popup">
		<div class="volume-track">
			<div class="volume-fill" style:height="{media.volume * 100}%"></div>
			<div class="volume-thumb" style:bottom="{media.volume * 100}%"></div>
		</div>
		<input class="volume-input" type="range" min="0" max="1" step="0.01" bind:value={media.volume} />
	</div>
	{#if children}{@render children()}{/if}
</div>

<style>
	.MediaControls {
		display: flex;
		gap: 1em;
		align-items: center;
		padding: 1em;
		border-radius: 0.75em;
		background-color: var(--bg-menu);

		> :not(.timeline) {
			flex: 0 0 auto;
		}

		.timeline {
			position: relative;
			flex: 1 1 auto;
			height: 8px;
			display: flex;
			align-items: center;
		}

		.timeline-track {
			position: absolute;
			inset: 0;
			background-color: var(--bg-normal);
			border-radius: 4px;
			overflow: hidden;
			pointer-events: none;
		}

		.buffered-range {
			position: absolute;
			top: 0;
			bottom: 0;
			background-color: var(--bg-alt);
		}

		.played-range {
			position: absolute;
			top: 0;
			bottom: 0;
			left: 0;
			background-color: var(--bg-strong);
		}

		.timeline-thumb {
			position: absolute;
			top: 50%;
			transform: translate(-50%, -50%);
			pointer-events: none;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.seek-input {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			margin: 0;
			opacity: 0;
			cursor: pointer;
		}

		button.volume {
			anchor-name: --volume-btn;
		}

		.volume-popup {
			position: absolute;
			position-anchor: --volume-btn;
			bottom: anchor(top);
			left: anchor(center);
			transform: translateX(-50%);
			margin-bottom: 0.5em;
			background-color: var(--bg-menu);
			border-radius: 0.75em;
			padding: 1em 0;
			height: 100px;
			width: 40px;
			display: none;
			align-items: center;
			justify-content: center;
			box-shadow: 0 4px 12px #0001;
			z-index: 10;
		}

		.volume-popup::after {
			content: '';
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			height: 0.5em;
		}

		button.volume:hover ~ .volume-popup,
		.volume-popup:hover,
		.volume-popup:focus-within {
			display: flex;
		}

		.volume-track {
			position: relative;
			width: 6px;
			height: 100%;
			background-color: var(--bg-alt);
			border-radius: 3px;
			pointer-events: none;
		}

		.volume-fill {
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			background-color: var(--bg-strong);
			border-radius: 3px;
			pointer-events: none;
		}

		.volume-thumb {
			position: absolute;
			left: 50%;
			transform: translate(-50%, 50%);
			width: 0.75em;
			height: 0.75em;
			border-radius: 50%;
			background-color: var(--fg-normal);
			pointer-events: none;
			box-shadow: 0 0 5px #0001;
		}

		.volume-input {
			appearance: slider-vertical;
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			margin: 0;
			cursor: pointer;
			writing-mode: vertical-lr;
			direction: rtl;
			opacity: 0;
		}
	}
</style>
