<script lang="ts">
	import { text } from '@axium/client';
	import { MediaGrid } from '@axium/kino/components';

	const { data } = $props();

	const movies = $derived(data.movies.map(movie => ({ ...movie, type: 'movie' as const })));
</script>

<svelte:head>
	<title>{text('page.kino.movies.title')}</title>
</svelte:head>

<h1>{text('page.kino.movies.title')}</h1>

<MediaGrid items={movies} empty={text('page.kino.movies.empty')} />

<style>
	h1 {
		margin: 0;
	}
</style>
