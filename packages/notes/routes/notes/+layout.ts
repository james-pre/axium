import { connect } from '@axium/client/socket';
import { schemas } from '@axium/client/sync';
import { currentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import { Note } from '@axium/notes/common';

schemas.set('notes', Note);

export const ssr = false;

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await currentSession();

	if (session) await connect().catch(() => null);

	return { session };
}
