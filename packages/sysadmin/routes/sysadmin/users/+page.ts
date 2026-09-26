import { fetchAPI } from '@axium/client/requests';

export async function load({ parent }) {
	const { session } = await parent();

	const users = await fetchAPI('GET', 'users/:id/sysadmin/users', {}, session.userId);

	return { session, users };
}
