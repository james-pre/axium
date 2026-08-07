<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import MediaControls from './MediaControls.svelte';
	import { MediaState, type MediaProps } from './reactive/media.svelte.js';

	interface Props extends MediaProps {
		extraControls?: Snippet;
		media?: MediaState;
	}

	const { extraControls, autoplay, media = new MediaState(), ...rest }: Props = $props();

	const overlay = $derived(media.fullscreen || media.touch);

	$effect(media.showControls);

	const onSurface = (e: MouseEvent) => e.target === e.currentTarget || e.target === media.element;

	function surface(e: MouseEvent) {
		if (e.detail > 1 || !onSurface(e)) return;
		if (media.touch) media.toggleControls();
		else media.click();
	}

	/** Double tapping either side of the centered play button skips */
	function skip(e: MouseEvent & { currentTarget: HTMLElement }) {
		if (!media.touch || !onSurface(e)) return;
		e.preventDefault();
		const { left, width } = e.currentTarget.getBoundingClientRect();
		media.skip(e.clientX < left + width / 2 ? -media.skipSeconds : media.skipSeconds);
		media.showControls();
	}
</script>

<svelte:document onfullscreenchange={media.updateFullscreen} />

<div
	class={['Video', overlay && 'overlay', !media.controlsVisible && 'hide-controls']}
	onkeydown={media.keydown}
	onclick={surface}
	ondblclick={skip}
	onpointermove={e => e.pointerType == 'mouse' && media.showControls()}
	bind:this={media.container}
>
	<video
		src={rest.src}
		preload="metadata"
		bind:this={media.element}
		bind:currentTime={media.currentTime}
		bind:duration={media.duration}
		bind:volume={media.volume}
		bind:paused={media.paused}
		bind:muted={media.muted}
		bind:buffered={media.buffered}
		bind:playbackRate={media.playbackRate}
		bind:ended={media.ended}
		{autoplay}
	>
		<track kind="captions" />
	</video>
	{#if media.touch}
		<button class="reset play-toggle" onclick={media.click}>
			<Icon i={media.playIcon} />
		</button>
	{/if}
	<MediaControls {media} {overlay}>
		<button class="reset icon-text" onclick={media.toggleFullscreen}>
			<Icon i={media.fullscreen ? 'compress-wide' : 'expand-wide'} />
		</button>
		{#if extraControls}{@render extraControls()}{/if}
	</MediaControls>
</div>

<style>
	.Video {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		gap: 1em;
		touch-action: manipulation;

		:global(.MediaControls) {
			width: 100%;
		}

		> video {
			max-width: 100%;
			max-height: 100%;
			min-height: 0;
			object-fit: contain;
		}

		&:fullscreen {
			background-color: #000;

			> video {
				width: 100%;
				height: 100%;
			}

			&.hide-controls {
				cursor: none;
			}
		}

		&.overlay {
			gap: 0;

			:global(.MediaControls) {
				position: absolute;
				right: 1em;
				bottom: 1em;
				left: 1em;
				width: auto;
			}

			:global(.MediaControls),
			.play-toggle {
				transition: opacity 150ms ease;
			}

			/* Keep them reachable by keyboard even once the countdown has run out */
			&.hide-controls :global(.MediaControls:not(:focus-within)),
			&.hide-controls .play-toggle {
				opacity: 0;
				pointer-events: none;
			}
		}
	}

	.play-toggle {
		--size: 2em;
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 0.75em;
		border-radius: 50%;
		background-color: hsl(from var(--bg-menu) h s l / 80%);
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
