import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	return { conversation: await fetchAPI('GET', 'ai/conversations/:id', {}, params.id!) };
}
