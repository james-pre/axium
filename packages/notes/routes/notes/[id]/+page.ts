import { fetchAPI } from '@axium/client/requests';

export async function load({ params }) {
	const note = await fetchAPI('GET', 'notes/:id', {}, params.id!);

	return { note };
}
