import { redirect } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';

export async function load(event: PageServerLoadEvent) {
	const session = await event.locals.auth();

	if (!session) redirect(307, '/auth/signin');
	if (!session.user.name) redirect(307, '/edit/name');

	return { session };
}
