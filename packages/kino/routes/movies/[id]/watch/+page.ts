import { getMovie } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params }) {
	const movie = await getMovie(Number(params.id));

	if (!movie.upload) error(404, 'This movie has not been uploaded');

	return { movie, upload: movie.upload };
}
