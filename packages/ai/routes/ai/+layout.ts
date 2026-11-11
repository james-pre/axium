import '@axium/ai/common';
import { preferences } from '@axium/client';
import { fetchAPI } from '@axium/client/requests';
import { currentSession } from '@axium/client/user';
import type { Session, UserPublic } from '@axium/core';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent, depends }) {
	depends('ai:conversations');

	let { session }: { session?: (Session & { user: UserPublic }) | null } = await parent();

	session ||= await currentSession();

	if (!session) redirect(307, '/login?after=/ai');

	const [conversations, models, aiPreferences] = await Promise.all([
		fetchAPI('GET', 'users/:id/ai/conversations', {}, session.userId),
		fetchAPI('GET', 'ai/models'),
		preferences.get(session.userId, 'ai'),
	]);

	return { session, conversations, models, preferences: aiPreferences };
}
