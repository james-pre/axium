<script lang="ts">
	import { text } from '@axium/client';
	import type * as kt from 'kinotool';
	import Poster from './Poster.svelte';

	const { id, seasons }: { id: number; seasons?: kt.Season[] } = $props();
</script>

<div class="SeasonList">
	{#each seasons || [] as season (season.season_number)}
		<a class="season" href="/tv/{id}/{season.season_number}">
			<Poster path={season.poster_path} type="poster" size="w185" alt={season.name} />
			<span class="name">{season.name}</span>
			{#if season.air_date}
				<span class="subtle year">{season.air_date.getFullYear()}</span>
			{/if}
		</a>
	{:else}
		<p class="subtle">{text('kino.no_episodes')}</p>
	{/each}
</div>

<style>
	.SeasonList {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8em, 1fr));
		gap: 1em;
		align-items: start;

		&:has(> p) {
			display: block;
		}
	}

	.season {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		text-decoration: none;
		color: inherit;

		&:hover .name {
			color: var(--fg-strong);
		}
	}

	.year {
		font-size: 0.85em;
	}
</style>
