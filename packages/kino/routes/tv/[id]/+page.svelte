<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { text } from '@axium/client';
	import { uploadShowDrop } from '@axium/kino/client/frontend';
	import { DropZone, MediaDetail, SeasonList } from '@axium/kino/components';

	const { data } = $props();

	const show = $derived(data.show);
</script>

<svelte:head>
	<title>{show.name}</title>
</svelte:head>

<DropZone
	label={text('kino.drop_show')}
	onDrop={async entries => {
		if (await uploadShowDrop(entries, show.id)) await invalidateAll();
	}}
>
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
			<span class="subtle hint">{text('kino.drop_show_hint')}</span>
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
