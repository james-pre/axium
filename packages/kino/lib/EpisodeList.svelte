<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { viewProgress, type KinoEpisode } from '@axium/kino/common';
	import Poster from './Poster.svelte';
	import ProgressBar from './ProgressBar.svelte';

	const { id, season, episodes }: { id: number; season: number; episodes?: KinoEpisode[] } = $props();
</script>

<div class="EpisodeList">
	{#each episodes || [] as episode (episode.episode_number)}
		{@const progress = viewProgress(episode.progress)}
		<a class="episode" href="/tv/{id}/{season}/{episode.episode_number}">
			<div class="art">
				<Poster path={episode.still_path} type="still" size="w185" alt={episode.name} />
				{#if progress !== null}
					<ProgressBar value={progress} />
				{/if}
			</div>

			<div class="info">
				<span class="number subtle">{text('kino.episode_number', { number: episode.episode_number })}</span>
				<span class="name">{episode.name}</span>
			</div>

			<Icon i={episode.upload ? 'circle-play' : 'upload'} class="status" />
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

	/* Explicit columns: artwork, then the label, then the status icon pinned to the right */
	.episode {
		display: grid;
		grid-template-columns: 8em 1fr auto;
		gap: 1em;
		align-items: center;
		padding: 0.5em;
		border-radius: 0.5em;
		text-decoration: none;
		color: inherit;

		&:hover {
			background-color: var(--bg-strong);
		}

		:global(.status) {
			--fill: var(--fg-accent);
		}
	}

	.art {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.number {
		font-size: 0.85em;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (width < 700px) {
		.episode {
			grid-template-columns: 5em 1fr auto;
		}
	}
</style>
