<script lang="ts">
	import { text } from '@axium/client';
	import { Video } from '@axium/client/components';
	import { MediaState } from '@axium/client/reactive';
	import { movieDataURL } from '@axium/kino/client';
	import { trackWatch } from '@axium/kino/watch';

	const { data } = $props();

	const { movie, upload } = $derived(data);

	const media = new MediaState();

	trackWatch({ media, target: { type: 'movie', id: data.movie.id }, resumeFrom: data.view?.position });
</script>

<svelte:head>
	<title>{text('page.kino.watch_title', { name: movie.title })}</title>
</svelte:head>

<div class="watch">
	<a class="subtle" href="/movies/{movie.id}">{movie.title}</a>
	<Video {media} src={movieDataURL(movie.id)} size={upload.size} type={upload.type} name={movie.title} />
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
