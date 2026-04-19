import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) return { lists: [] };

	const lists = await fetchAPI('GET', 'users/:id/task_lists', {}, session.userId);

	return { lists };
}
