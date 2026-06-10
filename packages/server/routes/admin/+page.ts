import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load() {
	return await fetchAPI('GET', 'admin/summary');
}
