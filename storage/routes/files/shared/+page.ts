import { itemsSharedWith } from '@axium/storage/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent, url }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=' + url.pathname);

	return { items: await itemsSharedWith(session.userId) };
}
