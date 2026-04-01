import type { Contact } from '@axium/contacts';
import { getContact } from '@axium/contacts/client';

export const ssr = false;

export async function load({ parent, params }) {
	let { session } = await parent();

	const contact: Contact = await getContact(params.id);

	return { session, contact };
}
