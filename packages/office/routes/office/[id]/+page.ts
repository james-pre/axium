import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	const mobile = matchMedia('(width < 700px)').matches;
	return await fetchAPI('GET', 'office/:id', { mobile }, params.id!);
}
