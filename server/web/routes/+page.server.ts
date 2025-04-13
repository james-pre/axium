import { redirect } from '@sveltejs/kit';
import { adapter } from '../../dist/auth.js';
import type { PageServerLoadEvent } from './$types';

export async function load(event: PageServerLoadEvent) {
	const session = await event.locals.auth();

	if (!session) redirect(307, '/auth/signin');
	if (!session.user.name) redirect(307, '/edit/name');

	const user = await adapter.getUserByEmail(session.user.email);

	return { session, user };
}
