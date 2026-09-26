import { fetchAPI } from '@axium/client/requests';

export async function load() {
	const result = await fetchAPI('GET', 'admin/config');

	return result;
}
