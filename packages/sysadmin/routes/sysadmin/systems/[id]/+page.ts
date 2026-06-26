import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent, params }) {
	const { session } = await parent();

	const [system, systemUsers] = await Promise.all([
		fetchAPI('GET', 'sysadmin/systems/:id', {}, params.id),
		fetchAPI('GET', 'users/:id/sysadmin/users', {}, session.userId),
	]);

	return { session, system, systemUsers };
}
