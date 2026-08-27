import { connect } from '@axium/client/socket';
import { schemas } from '@axium/client/sync';
import { getCurrentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import { Note } from '@axium/notes/common';

schemas.set('notes', Note);

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	if (session) await connect().catch(() => null);

	return { session };
}
