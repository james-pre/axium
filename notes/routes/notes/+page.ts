import { fetchAPI } from '@axium/client/requests';
import { parseNote } from '@axium/notes/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	let { session } = await parent();

	if (!session) redirect(307, '/login?after=/notes');

	const notes = await fetchAPI('GET', 'users/:id/notes', {}, session.userId);

	for (const note of notes) parseNote(note);

	return { notes, session };
}
