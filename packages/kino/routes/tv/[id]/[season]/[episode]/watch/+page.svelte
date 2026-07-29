<script lang="ts">
	import { text } from '@axium/client';
	import { Video } from '@axium/client/components';
	import { MediaState } from '@axium/client/reactive';
	import { episodeDataURL } from '@axium/kino/client';
	import { trackWatch } from '@axium/kino/watch';

	const { data } = $props();

	const { show, season, episode, upload } = $derived(data);

	const code = $derived(text('kino.episode_code', { season, episode: episode.episode_number }));

	const media = new MediaState();

	trackWatch({
		media,
		target: { type: 'tv', id: data.show.id, season: data.season, episode: data.episode.episode_number },
		resumeFrom: data.view?.position,
	});
</script>

<svelte:head>
	<title>{text('page.kino.watch_title', { name: `${show.name} ${code}` })}</title>
</svelte:head>

<div class="watch">
	<a class="subtle" href="/tv/{show.id}/{season}/{episode.episode_number}">{show.name} — {code} — {episode.name}</a>
	<Video
		{media}
		src={episodeDataURL(show.id, season, episode.episode_number)}
		size={upload.size}
		type={upload.type}
		name={episode.name}
	/>
</div>

<style>
	.watch {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		height: 80vh;
		min-height: 0;
	}
</style>
