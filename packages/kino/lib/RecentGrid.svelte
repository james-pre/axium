<script lang="ts">
	import { text } from '@axium/client';
	import { type KinoView, viewProgress } from '@axium/kino/common';
	import Poster from './Poster.svelte';
	import ProgressBar from './ProgressBar.svelte';

	const { views, empty }: { views: KinoView[]; empty: string } = $props();

	function key(view: KinoView): string {
		return view.type == 'movie'
			? `movie:${view.movie.id}`
			: `tv:${view.show.id}:${view.episode.season_number}:${view.episode.episode_number}`;
	}
</script>

<div class="RecentGrid">
	{#each views as view (key(view))}
		{const title = view.type == 'movie' ? view.movie.title : view.show.name}
		<!-- Resume where they left off rather than starting over -->
		<a
			class="recent"
			href={view.type == 'movie'
				? `/movies/${view.movie.id}/watch`
				: `/tv/${view.show.id}/${view.episode.season_number}/${view.episode.episode_number}/watch`}
		>
			<Poster path={view.type == 'movie' ? view.movie.poster_path : view.show.poster_path} type="poster" size="w342" alt={title} />

			{const progress = viewProgress(view)}
			{#if progress !== null}
				<ProgressBar value={progress} />
			{/if}

			<span class="title">{title}</span>

			{#if view.type == 'tv'}
				<span class="subtle detail">
					{text('kino.episode_code', { season: view.episode.season_number, episode: view.episode.episode_number })}
					· {view.episode.name}
				</span>
			{/if}
		</a>
	{:else}
		<p class="subtle">{empty}</p>
	{/each}
</div>

<style>
	.RecentGrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9em, 1fr));
		gap: 1em;
		align-items: start;

		&:has(> p) {
			display: block;
		}
	}

	.recent {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		text-decoration: none;
		color: inherit;

		&:hover .title {
			color: var(--fg-strong);
		}
	}

	.title {
		text-wrap: balance;
		line-height: 1.2;
	}

	.detail {
		font-size: 0.85em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
