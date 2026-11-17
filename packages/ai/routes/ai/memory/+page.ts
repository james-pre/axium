import { fetchAPI } from '@axium/client/requests';

export async function load({ parent }) {
	const { session } = await parent();
	const [memories, updates] = await Promise.all([
		fetchAPI('GET', 'users/:id/ai/memories', {}, session.userId),
		fetchAPI('GET', 'users/:id/ai/memory_updates', {}, session.userId),
	]);
	return { memories, updates };
}
