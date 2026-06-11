import { getUserUsage } from '@axium/storage/client';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	const { session } = await parent();

	if (!session) redirect(307, '/login?after=/files/usage');

	const info = await getUserUsage(session.userId);

	return info;
}
