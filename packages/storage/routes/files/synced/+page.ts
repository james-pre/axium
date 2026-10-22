import { getUserSyncs } from '@axium/storage/client';
import { redirect } from '@sveltejs/kit';

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/files/synced');

	return { syncs: await getUserSyncs(session.userId) };
}
