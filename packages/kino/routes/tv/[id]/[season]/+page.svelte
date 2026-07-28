<script lang="ts">
	import { text } from '@axium/client';
	import { EpisodeList, MediaDetail } from '@axium/kino/components';

	const { data } = $props();

	const { show, season } = $derived(data);
</script>

<svelte:head>
	<title>{show.name} — {season.name}</title>
</svelte:head>

<MediaDetail
	title={season.name}
	imagePath={season.poster_path}
	backdropPath={show.backdrop_path}
	date={season.air_date}
	dateKind="aired"
	overview={season.overview}
>
	{#snippet context()}
		<a href="/tv/{show.id}">{show.name}</a>
	{/snippet}

	<section>
		<h2>{text('kino.episodes')}</h2>
		<EpisodeList id={show.id} season={season.season_number} episodes={season.episodes} />
	</section>
</MediaDetail>

<style>
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
