import { fetchAPI } from '@axium/client/requests';
import { parseNote } from '@axium/notes/client';

export const ssr = false;

export async function load({ params }) {
	const note = await fetchAPI('GET', 'notes/:id', {}, params.id!);

	parseNote(note);

	return { note };
}
