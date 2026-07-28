<script lang="ts">
	import { text } from '@axium/client';
	import { episodeDataURL } from '@axium/kino/client';
	import { uploadEpisodeFile } from '@axium/kino/client/frontend';
	import { MediaActions, MediaDetail } from '@axium/kino/components';

	const { data } = $props();

	const { show, season, episode } = $derived(data);

	const code = $derived(text('kino.episode_code', { season, episode: episode.episode_number }));

	let upload = $state(data.episode.upload);
</script>

<svelte:head>
	<title>{show.name} — {code}</title>
</svelte:head>

<MediaDetail
	title={episode.name}
	imagePath={episode.still_path}
	imageType="still"
	backdropPath={show.backdrop_path}
	date={episode.air_date}
	dateKind="aired"
	overview={null}
>
	{#snippet context()}
		<a href="/tv/{show.id}">{show.name}</a>
		·
		<a href="/tv/{show.id}/{season}">{code}</a>
	{/snippet}

	{#snippet actions()}
		<MediaActions
			bind:upload
			watchHref="/tv/{show.id}/{season}/{episode.episode_number}/watch"
			dataURL={episodeDataURL(show.id, season, episode.episode_number)}
			uploadText={text('kino.upload_episode')}
			uploadFile={file => uploadEpisodeFile(file, show.id, season, episode.episode_number)}
		/>
	{/snippet}
</MediaDetail>
