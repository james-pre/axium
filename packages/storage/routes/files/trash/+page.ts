import { preferences } from '@axium/client';
import { getUserTrash } from '@axium/storage/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/files/trash');

	const [items, { full_path_in_special }] = await Promise.all([getUserTrash(session.userId), preferences.get(session.userId, 'files')]);

	return { session, items, full_path_in_special };
}
