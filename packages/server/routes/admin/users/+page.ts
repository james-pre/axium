import { fetchAPI } from '@axium/client/requests';

export async function load() {
	const users = await fetchAPI('GET', 'admin/users');

	return { users };
}
