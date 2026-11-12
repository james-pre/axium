import { fetchAPI } from '@axium/client/requests';

export async function load() {
	return { models: await fetchAPI('GET', 'ai/models') };
}
