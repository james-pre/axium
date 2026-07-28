<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import type { KinoEpisode } from '@axium/kino/common';
	import Poster from './Poster.svelte';

	const { id, season, episodes }: { id: number; season: number; episodes?: KinoEpisode[] } = $props();
</script>

<div class="EpisodeList">
	{#each episodes || [] as episode (episode.episode_number)}
		<a class="episode" href="/tv/{id}/{season}/{episode.episode_number}">
			<Poster path={episode.still_path} type="still" size="w185" alt={episode.name} />
			<span class="number subtle">{text('kino.episode_number', { number: episode.episode_number })}</span>
			<span class="name">{episode.name}</span>
			<span class="status subtle icon-text">
				<Icon i={episode.upload ? 'circle-play' : 'upload'} />
			</span>
		</a>
	{:else}
		<p class="subtle">{text('kino.no_episodes')}</p>
	{/each}
</div>

<style>
	.EpisodeList {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.episode {
		display: grid;
		grid-template-columns: 8em 1fr auto;
		grid-template-rows: auto auto;
		column-gap: 1em;
		align-items: center;
		padding: 0.5em;
		border-radius: 0.5em;
		text-decoration: none;
		color: inherit;

		&:hover {
			background-color: var(--bg-strong);
		}

		& :global(.Poster) {
			grid-row: 1 / 3;
		}
	}

	.number {
		align-self: end;
		font-size: 0.85em;
	}

	.name {
		align-self: start;
	}

	.status {
		grid-row: 1 / 3;
	}

	@media (width < 700px) {
		.episode {
			grid-template-columns: 5em 1fr auto;
		}
	}
</style>
