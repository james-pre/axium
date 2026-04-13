<script lang="ts">
	import type { Snippet } from 'svelte';
	import MediaControls from './MediaControls.svelte';
	import { getMetadata, MediaState, type MediaProps } from './media.svelte.js';

	interface Props extends MediaProps {
		extraControls?: Snippet;
	}

	const { extraControls, ...rest }: Props = $props();
	const { src } = rest;

	const { metadata, pictureURL } = await getMetadata(rest);

	const media = new MediaState();
</script>

<div class="Video" onkeydown={media.keydown}>
	<video
		{src}
		bind:currentTime={media.currentTime}
		bind:duration={media.duration}
		bind:volume={media.volume}
		bind:paused={media.paused}
		bind:muted={media.muted}
		bind:buffered={media.buffered}
		bind:playbackRate={media.playbackRate}
		poster={pictureURL}
	>
		<track kind="captions" />
	</video>
	<MediaControls {media} />
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
