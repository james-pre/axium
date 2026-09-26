import { fetchAPI } from '@axium/client/requests';

export async function load() {
	return await fetchAPI('GET', 'admin/summary');
}
