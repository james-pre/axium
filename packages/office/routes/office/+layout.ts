import '@axium/office/common';
import { currentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent, url }) {
	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await currentSession();

	if (!session) redirect(307, `/login?after=${url.pathname}`);

	return { session };
}
