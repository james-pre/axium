import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ params }) {
	const [user, auth] = await Promise.all([
		fetchAPI('GET', 'users/:id/full', null, params.id),
		fetchAPI('OPTIONS', 'users/:id/auth', null, params.id),
	]);

	return { user, auth };
}
