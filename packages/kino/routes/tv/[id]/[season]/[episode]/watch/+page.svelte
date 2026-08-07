<script lang="ts">
	import { text } from '@axium/client';
	import { Icon, Video } from '@axium/client/components';
	import { MediaState } from '@axium/client/reactive';
	import { episodeDataURL } from '@axium/kino/client';
	import type { KinoEpisode } from '@axium/kino/common';
	import { Poster } from '@axium/kino/components';
	import { trackWatch } from '@axium/kino/watch';

	const { data } = $props();

	const { show, season, episode, upload, previous, next, autoplay } = $derived(data);

	const code = $derived(text('kino.episode_code', { season, episode: episode.episode_number }));

	const media = new MediaState();

	trackWatch({
		media,
		target: { type: 'tv', id: data.show.id, season: data.season, episode: data.episode.episode_number },
		resumeFrom: data.episode.progress?.position,
	});
</script>

<svelte:head>
	<title>{text('page.kino.watch_title', { name: `${show.name} ${code}` })}</title>
</svelte:head>

{#snippet nav(direction: 'previous' | 'next', target?: KinoEpisode)}
	{#if target}
		{const label = text(direction == 'next' ? 'kino.next_episode' : 'kino.previous_episode')}
		<a
			class={['episode-nav', 'icon-text', direction]}
			href="/tv/{show.id}/{target.season_number}/{target.episode_number}{target.upload ? '/watch?play' : ''}"
			aria-label={label}
		>
			<Icon i={direction == 'next' ? 'forward-step' : 'backward-step'} />

			<div class="preview">
				<Poster path={target.still_path} type="still" size="w185" alt="" />
				<span class="subtle">
					{label} - {text('kino.episode_code', { season: target.season_number, episode: target.episode_number })}
				</span>
				<span class="name">{target.name}</span>
				{#if !target.upload}
					<span class="subtle">{text('kino.not_uploaded')}</span>
				{/if}
			</div>
		</a>
	{/if}
{/snippet}

<div class="watch">
	<nav class="crumbs subtle">
		<a href="/tv/{show.id}">{show.name}</a>
		<Icon i="chevron-right" />
		<a href="/tv/{show.id}/{season}"
			>{show.seasons?.find(s => s.season_number == season)?.name || text('kino.season', { number: season })}</a
		>
		<Icon i="chevron-right" />
		<a href="/tv/{show.id}/{season}/{episode.episode_number}"
			>{episode.name || text('kino.episode_number', { number: episode.episode_number })} [{code}]</a
		>
	</nav>
	<Video
		{media}
		src={episodeDataURL(show.id, season, episode.episode_number)}
		size={upload.size}
		type={upload.type}
		name={episode.name}
		{autoplay}
	>
		{#snippet extraControls()}
			{@render nav('previous', previous)}
			{@render nav('next', next)}
		{/snippet}
	</Video>
</div>

<style>
	.watch {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		height: 80vh;
		min-height: 0;
	}

	.crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;

		a:hover {
			text-decoration: underline;
		}

		:global(.Icon) {
			--size: 0.75em;
		}
	}

	.episode-nav {
		color: inherit;
		text-decoration: none;

		&.previous {
			anchor-name: --nav-previous;
		}

		&.next {
			anchor-name: --nav-next;
		}
	}

	.preview {
		position: absolute;
		position-area: top;
		position-try-fallbacks: flip-inline;
		margin-bottom: 0.75em;
		width: 14em;
		max-width: calc(100vw - 2em);
		display: none;
		flex-direction: column;
		gap: 0.25em;
		padding: 0.5em;
		border-radius: 0.75em;
		background-color: var(--bg-menu);
		box-shadow: 0 4px 12px #0004;
		font-size: 0.85em;
		z-index: 10;
		pointer-events: none;
	}

	.previous .preview {
		position-anchor: --nav-previous;
	}

	.next .preview {
		position-anchor: --nav-next;
	}

	.episode-nav:hover .preview,
	.episode-nav:focus-visible .preview {
		display: flex;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
