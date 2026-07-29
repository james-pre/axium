import { getUploadedMovies, getUploadedShows, getViews } from '@axium/kino/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/kino');

	const [movies, shows, views] = await Promise.all([
		getUploadedMovies(),
		getUploadedShows(),
		// The library is the point of the page, so don't fail it over the recently watched list
		getViews().catch(() => []),
	]);

	return { movies, shows, views };
}
