import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	return { model: await fetchAPI('GET', 'ai/models/:id', {}, params.id!) };
}
