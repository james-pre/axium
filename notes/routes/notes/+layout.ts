import { getCurrentSession } from '@axium/client/user';
import type { Session } from '@axium/core';

export async function load({ parent }) {
	let { session }: { session?: Session | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	return { session };
}
