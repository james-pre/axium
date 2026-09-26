import { getMovie, getViews } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const id = Number(params.id);

	const [movie, [view]] = await Promise.all([
		getMovie(id),
		// Used to resume where the last session left off; not worth failing the page over
		getViews({ type: 'movie', id, limit: 1 }).catch(() => []),
	]);

	if (!movie.upload) error(404, 'This movie has not been uploaded');

	return { movie, upload: movie.upload, view };
}
