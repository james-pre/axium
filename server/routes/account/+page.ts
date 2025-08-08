import { emailVerificationEnabled, getCurrentSession, getPasskeys, getSessions } from '@axium/client/user';
import type { Session, User } from '@axium/core';

export const ssr = false;

export async function load() {
	let currentSession: Session & { user: User };
	try {
		currentSession = await getCurrentSession();
	} catch {
		window.location.href = '/login?after=/account';
		throw 'Missing session, redirecting to login';
	}

	const user = currentSession.user;

	return {
		currentSession,
		user,
		passkeys: await getPasskeys(user.id),
		sessions: await getSessions(user.id),
		canVerify: await emailVerificationEnabled(user.id),
	};
}
