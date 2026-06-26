import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent, params }) {
	const { session } = await parent();

	const system = await fetchAPI('GET', 'sysadmin/systems/:id', {}, params.id);

	return { session, system };
}
