<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { text } from '@axium/client';
	import { uploadSeasonDrop } from '@axium/kino/client/frontend';
	import { DropZone, EpisodeList, MediaDetail } from '@axium/kino/components';

	const { data } = $props();

	const { show, season } = $derived(data);
</script>

<svelte:head>
	<title>{show.name} — {season.name}</title>
</svelte:head>

<DropZone
	label={text('kino.drop_season')}
	onDrop={async entries => {
		if (await uploadSeasonDrop(entries, show.id, season.season_number)) await invalidateAll();
	}}
>
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
			<span class="subtle hint">{text('kino.drop_season_hint')}</span>
		</section>
	</MediaDetail>
</DropZone>

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

	.hint {
		font-size: 0.85em;
	}
</style>
