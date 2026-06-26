import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	const [systems, users] = await Promise.all([
		fetchAPI('GET', 'users/:id/sysadmin/systems', {}, session.userId),
		fetchAPI('GET', 'users/:id/sysadmin/users', {}, session.userId),
	]);

	return { session, systems, users };
}
