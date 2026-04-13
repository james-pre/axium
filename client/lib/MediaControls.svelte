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
	<button class="reset icon-text" onclick={() => (media.paused = !media.paused)}>
		<Icon i={media.paused ? 'play' : 'pause'} />
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
	<button class="reset icon-text" onclick={() => (media.muted = !media.muted)}>
		<Icon i={media.muted ? 'volume-slash' : 'volume'} />
	</button>
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
	}
</style>
