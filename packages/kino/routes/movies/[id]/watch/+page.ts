import { getMovie, getViews } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id);

	const movie = await getMovie(id);

	if (!movie.upload) error(404, 'This movie has not been uploaded');

	// Used to resume where the last session left off; not worth failing the page over
	const views = await getViews().catch(() => []);
	const view = views.find(v => v.type == 'movie' && v.movie.id == id);

	return { movie, upload: movie.upload, view };
}
