import { fetchAPI } from '@axium/client/requests';
import type {} from '@axium/contacts/common';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	let { session } = await parent();

	if (!session) redirect(307, '/login?after=/contacts');

	const contacts = await fetchAPI('GET', 'users/:id/contacts', {}, session.userId);

	return { contacts, session };
}
