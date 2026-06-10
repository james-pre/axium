import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ params }) {
	const user = await fetchAPI('GET', 'users/:id/full', null, params.id);

	return { user };
}
