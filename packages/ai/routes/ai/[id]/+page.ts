import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	const [conversation, models] = await Promise.all([
		fetchAPI('GET', 'ai/conversations/:id', {}, params.id!),
		fetchAPI('GET', 'ai/models'),
	]);

	return { conversation, models };
}
