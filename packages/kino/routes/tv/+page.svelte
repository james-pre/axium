<script lang="ts">
	import { text } from '@axium/client';
	import { MediaGrid } from '@axium/kino/components';

	const { data } = $props();

	const shows = $derived(data.shows.map(show => ({ ...show, type: 'tv' as const })));
</script>

<svelte:head>
	<title>{text('page.kino.tv.title')}</title>
</svelte:head>

<h1>{text('page.kino.tv.title')}</h1>

<MediaGrid items={shows} empty={text('page.kino.tv.empty')} />

<style>
	h1 {
		margin: 0;
	}
</style>
