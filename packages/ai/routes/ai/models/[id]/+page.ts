import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	const [model, models] = await Promise.all([fetchAPI('GET', 'ai/models/:id', {}, params.id!), fetchAPI('GET', 'ai/models')]);
	return { model, models };
}
