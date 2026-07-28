import { getUploadedShows } from '@axium/kino/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/tv');

	return { shows: await getUploadedShows() };
}
