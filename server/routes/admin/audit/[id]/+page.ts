import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ params }) {
	const event = await fetchAPI('GET', 'admin/audit/:eventId', null, params.id);

	return { event };
}
