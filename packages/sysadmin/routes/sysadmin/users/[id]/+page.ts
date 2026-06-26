import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent, params }) {
	const { session } = await parent();

	const user = await fetchAPI('GET', 'sysadmin/users/:id', {}, params.id);

	return { session, user };
}
