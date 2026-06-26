import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent, params }) {
	const { session } = await parent();

	const [user, systems] = await Promise.all([
		fetchAPI('GET', 'sysadmin/users/:id', {}, params.id),
		fetchAPI('GET', 'sysadmin/users/:id/systems', {}, params.id),
	]);

	return { session, user, systems };
}
