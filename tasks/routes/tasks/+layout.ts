import { getCurrentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';

export async function load({ parent, url }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	return { session };
}
