import { invalidateAll } from '$app/navigation';
import { addListener } from '@axium/client/socket';
import { getCurrentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import '@axium/email/common';

export const ssr = false;

addListener('email.received', () => void invalidateAll());

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	return { session };
}
