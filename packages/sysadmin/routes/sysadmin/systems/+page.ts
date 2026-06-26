import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	const systems = await fetchAPI('GET', 'users/:id/sysadmin/systems', {}, session.userId);

	return { session, systems };
}
