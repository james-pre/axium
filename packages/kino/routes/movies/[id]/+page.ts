import { getMovie } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	return { movie: await getMovie(Number(params.id)) };
}
