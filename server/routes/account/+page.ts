import { emailVerificationEnabled, getCurrentSession, getPasskeys, getSessions } from '@axium/client/user';

export const ssr = false;

export async function load() {
	const currentSession = await getCurrentSession().catch(() => {
		window.location.href = '/login?after=/account';
		return null;
	})!;

	const user = currentSession.user;

	return {
		currentSession,
		user,
		passkeys: await getPasskeys(user.id),
		sessions: await getSessions(user.id),
		canVerify: await emailVerificationEnabled(user.id),
	};
}
