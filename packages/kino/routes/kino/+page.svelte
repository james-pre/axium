<script lang="ts">
	import { text } from '@axium/client';
	import { MediaGrid } from '@axium/kino/components';

	const { data } = $props();

	const movies = $derived(data.movies.map(movie => ({ ...movie, type: 'movie' as const })));
	const shows = $derived(data.shows.map(show => ({ ...show, type: 'tv' as const })));
</script>

<svelte:head>
	<title>{text('page.kino.title')}</title>
</svelte:head>

<h1>{text('page.kino.heading')}</h1>

{#if !movies.length && !shows.length}
	<p class="subtle">{text('page.kino.empty')}</p>
{:else}
	{#if movies.length}
		<section>
			<h2>{text('page.kino.recent_movies')}</h2>
			<MediaGrid items={movies} empty={text('page.kino.movies.empty')} />
		</section>
	{/if}

	{#if shows.length}
		<section>
			<h2>{text('page.kino.recent_tv')}</h2>
			<MediaGrid items={shows} empty={text('page.kino.tv.empty')} />
		</section>
	{/if}
{/if}

<style>
	h1 {
		margin: 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
	}

	h2 {
		margin: 0;
		font-size: 1.15em;
	}
</style>
