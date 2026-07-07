import { fetchAPI } from '@axium/client/requests';
import { redirect } from '@sveltejs/kit';

export async function load({ parent, params }) {
	const { session } = await parent();

	if (!session) redirect(307, `/login?after=/email/${params.folder}/${params.id}`);

	const thread = await fetchAPI('GET', 'email/:id/thread', {}, params.id);

	return { thread, id: params.id, folder: params.folder, session };
}
