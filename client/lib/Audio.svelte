<script lang="ts">
	import { text } from '@axium/client/locales';
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

	const id = $props.id();

	const { metadata, picture, pictureURL } = await getMetadata(rest);

	const audioInfo = [
		['music', metadata.common.title],
		['album', metadata.common.album],
		['user-music', metadata.common.artist],
		['hashtag', metadata.common.track.no],
		['compact-disc', metadata.common.disk.no],
	] as const;

	const media = new MediaState();
</script>

<div class="Audio" onkeydown={media.keydown}>
	{#if showCover}
		<div class="audio-cover" onclick={media.click}>
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
		bind:ended={media.ended}
	></audio>
	<MediaControls {media}>
		{#if extraControls}{@render extraControls()}{/if}
		{#if audioInfo.some(([, value]) => !!value)}
			<button class="reset icon-text" command="show-modal" commandfor="{id}:audio-info">
				<Icon i="regular/circle-info" />
			</button>
		{/if}
	</MediaControls>
</div>

<dialog id="{id}:audio-info">
	<div class="audio-info">
		{#each audioInfo as [icon, value]}
			{#if value}
				<div class="icon-text">
					<Icon i={icon} />
					<span>{value}</span>
				</div>
			{/if}
		{/each}
	</div>
	<button command="close" commandfor="{id}:audio-info">{text('generic.done')}</button>
</dialog>

<style>
	.Audio {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 512px;

		:global(.MediaControls) {
			width: 100%;
			margin-top: 1em;
		}
	}

	.audio-cover {
		width: 100%;
		aspect-ratio: 1/1;
		background-color: var(--bg-alt);
		border-radius: 1em;
		display: flex;
		flex-direction: column;
		gap: 1em;
		align-items: center;
		justify-content: center;
		overflow: hidden;

		img {
			width: 100%;
			height: 100%;
			object-fit: scale-down;
		}
	}

	.audio-info {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		margin-bottom: 1em;
	}
</style>
