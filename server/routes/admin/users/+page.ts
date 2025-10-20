import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load() {
	const users = await fetchAPI('GET', 'admin/users/all');

	return { users };
}
