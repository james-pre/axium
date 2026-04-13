<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import MediaControls from './MediaControls.svelte';
	import { getMetadata, MediaState, type MediaProps } from './media.svelte.js';

	interface Props extends MediaProps {
		cover?: boolean;
		extraControls?: Snippet;
	}

	const { cover: showCover, extraControls, ...rest }: Props = $props();
	const { src } = rest;

	const { picture, pictureURL } = await getMetadata(rest);

	const media = new MediaState();
</script>

<div onkeydown={media.keydown}>
	{#if showCover}
		<div class="audio-cover">
			{#if picture}
				<img src={pictureURL} alt={picture.description} />
			{:else}
				<Icon i="music-note" --size="50px" />
			{/if}
		</div>
	{/if}

	<audio
		{src}
		bind:currentTime={media.currentTime}
		bind:duration={media.duration}
		bind:volume={media.volume}
		bind:paused={media.paused}
		bind:muted={media.muted}
		bind:buffered={media.buffered}
		bind:playbackRate={media.playbackRate}
	></audio>
	<MediaControls {media} />
</div>

<style>
	.audio-cover {
		width: 512px;
		height: 512px;
		background-color: var(--bg-alt);
		border-radius: 1em;
		display: flex;
		flex-direction: column;
		gap: 1em;
		align-items: center;
		justify-content: center;

		img {
			border-radius: 1em;
		}

		:global(.MediaControls) {
			width: 512px;
		}
	}
</style>
