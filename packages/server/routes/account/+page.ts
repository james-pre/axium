import { emailVerificationEnabled, getCurrentSession, getPasskeys, getSessions } from '@axium/client/user';
import type { Session, User } from '@axium/core';

export const ssr = false;

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	if (!session) {
		window.location.href = '/login?after=/account';
		throw 'Missing session, redirecting to login';
	}

	const { user } = session;

	return {
		session,
		user,
		passkeys: await getPasskeys(user.id),
		sessions: await getSessions(user.id),
		canVerify: await emailVerificationEnabled(user.id),
	};
}
