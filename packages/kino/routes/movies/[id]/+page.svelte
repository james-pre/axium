<script lang="ts">
	import { text } from '@axium/client';
	import { deleteMovieUpload, getMovie, movieDataURL } from '@axium/kino/client';
	import { uploadMovieDrop, uploadMovieFile } from '@axium/kino/client/frontend';
	import { DropZone, MediaActions, MediaDetail } from '@axium/kino/components';

	const { data } = $props();

	const movie = $derived(data.movie);

	let upload = $state(data.movie.upload);
</script>

<svelte:head>
	<title>{movie.title}</title>
</svelte:head>

<DropZone
	label={text('kino.drop_movie')}
	enabled={!upload}
	onDrop={async entries => {
		const result = await uploadMovieDrop(entries, movie.id);
		if (result) upload = result;
	}}
>
	<MediaDetail
		title={movie.title}
		imagePath={movie.poster_path}
		backdropPath={movie.backdrop_path}
		date={movie.release_date}
		overview={movie.overview}
	>
		{#snippet actions()}
			<MediaActions
				bind:upload
				watchHref="/movies/{movie.id}/watch"
				dataURL={movieDataURL(movie.id, true)}
				target={{ type: 'movie', id: movie.id }}
				user={data.session?.user}
				canDelete={data.session?.user.isAdmin}
				uploadFile={file => uploadMovieFile(file, movie.id)}
				refresh={async () => (await getMovie(movie.id)).upload}
				deleteUpload={() => deleteMovieUpload(movie.id)}
			/>
		{/snippet}
	</MediaDetail>
</DropZone>
