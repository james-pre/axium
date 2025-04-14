import { redirect } from '@sveltejs/kit';
import { adapter } from '../../dist/auth.js';
import type { PageServerLoadEvent } from './$types.js';
import { web } from '../../dist/config.js';

export async function load(event: PageServerLoadEvent) {
	const session = await event.locals.auth();

	if (!session) redirect(307, '/auth/signin');
	if (!session.user.name) redirect(307, web.prefix + '/name');

	const user = await adapter.getUserByEmail(session.user.email);

	return { session, user, prefix: web.prefix };
}
