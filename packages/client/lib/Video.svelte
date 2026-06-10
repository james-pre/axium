<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import MediaControls from './MediaControls.svelte';
	import { MediaState, type MediaProps } from './media.svelte.js';

	interface Props extends MediaProps {
		extraControls?: Snippet;
	}

	const { extraControls, ...rest }: Props = $props();

	const media = new MediaState();
</script>

<div class="Video" onkeydown={media.keydown}>
	<video
		src={rest.src}
		bind:this={media.element}
		bind:currentTime={media.currentTime}
		bind:duration={media.duration}
		bind:volume={media.volume}
		bind:paused={media.paused}
		bind:muted={media.muted}
		bind:buffered={media.buffered}
		bind:playbackRate={media.playbackRate}
		bind:ended={media.ended}
		onclick={media.click}
	>
		<track kind="captions" />
	</video>
	<MediaControls {media}>
		<button class="reset icon-text" onclick={() => media.element?.requestFullscreen()}>
			<Icon i="expand-wide" />
		</button>
		{#if extraControls}{@render extraControls()}{/if}
	</MediaControls>
</div>

<style>
	.Video {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		gap: 1em;

		:global(.MediaControls) {
			width: 100%;
		}
	}

	video {
		max-width: 100%;
		max-height: 100%;
		min-height: 0;
		object-fit: contain;
	}
</style>
