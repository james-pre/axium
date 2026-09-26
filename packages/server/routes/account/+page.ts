import { currentSession, getAuthInfo, getPasskeys, getSessions } from '@axium/client/user';
import type { Session, User } from '@axium/core';

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await currentSession();

	if (!session) {
		window.location.href = '/login?after=/account';
		throw 'Missing session, redirecting to login';
	}

	const { user } = session;

	return {
		session,
		user,
		passkeys: getPasskeys(user.id),
		sessions: getSessions(user.id),
		auth: getAuthInfo(user.id),
	};
}
