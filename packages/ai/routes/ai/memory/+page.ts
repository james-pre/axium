import { fetchAPI } from '@axium/client/requests';

export async function load({ parent }) {
	const { session } = await parent();
	return { memories: await fetchAPI('GET', 'users/:id/ai/memories', {}, session.userId) };
}
