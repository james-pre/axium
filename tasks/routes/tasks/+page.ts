import { fetchAPI } from '@axium/client/requests';
import { parseList } from '@axium/tasks/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/tasks');

	const lists = await fetchAPI('GET', 'users/:id/task_lists', {}, session.userId);

	for (const list of lists) parseList(list);

	return { lists };
}
