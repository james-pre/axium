import { connect } from '@axium/client/socket';
import { schemas } from '@axium/client/sync';
import { getCurrentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import { TaskList } from '@axium/tasks/common';

schemas.set('task_lists', TaskList);

export const ssr = false;

export async function load({ parent }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	if (session) await connect().catch(() => null);

	return { session };
}
