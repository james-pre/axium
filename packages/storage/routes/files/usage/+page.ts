import { preferences } from '@axium/client';
import { getUserUsage } from '@axium/storage/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/files/usage');

	const [info, { full_path_in_special }] = await Promise.all([getUserUsage(session.userId), preferences.get(session.userId, 'files')]);

	return { info, full_path_in_special };
}
