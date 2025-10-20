import { fetchAPI } from '@axium/client/requests';

export async function load() {
	return {
		plugins: await fetchAPI('GET', 'admin/plugins'),
	};
}
