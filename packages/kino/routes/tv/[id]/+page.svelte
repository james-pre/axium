<script lang="ts">
	import { text } from '@axium/client';
	import { MediaDetail, SeasonList } from '@axium/kino/components';

	const { data } = $props();

	const show = $derived(data.show);
</script>

<svelte:head>
	<title>{show.name}</title>
</svelte:head>

<MediaDetail
	title={show.name}
	imagePath={show.poster_path}
	backdropPath={show.backdrop_path}
	date={show.first_air_date}
	dateKind="aired"
	overview={show.overview}
>
	<section>
		<h2>{text('kino.seasons')}</h2>
		<SeasonList id={show.id} seasons={show.seasons} />
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
