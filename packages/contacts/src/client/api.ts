import { fetchAPI } from '@axium/client';
import Cache from '@axium/client/cache';
import type { Contact } from '@axium/contacts';

const cache = new Cache((id: string) => fetchAPI('GET', 'contacts/:id', {}, id));

export async function getContact(id: string): Promise<Contact> {
	return await cache.get(id);
}
