import { connect } from '@axium/client/socket';
import { currentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';

export const ssr = false;

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await currentSession();

	if (!session) {
		window.location.href = '/login?after=/sysadmin';
		throw 'Missing session, redirecting to login';
	}

	await connect();

	const { user } = session;

	return { session, user };
}
