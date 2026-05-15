import { fetchAPI, cache } from '@axium/client';
import type { Contact } from '@axium/contacts';

export async function getContact(id: string): Promise<Contact> {
	return await cache.use('contact', id, () => fetchAPI('GET', 'contacts/:id', {}, id));
}
