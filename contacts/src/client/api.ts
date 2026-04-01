import { fetchAPI, useCache } from '@axium/client';
import type { Contact } from '@axium/contacts';

export async function getContact(id: string): Promise<Contact> {
	return await useCache('contact', id, () => fetchAPI('GET', 'contacts/:id', {}, id));
}
