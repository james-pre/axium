import { redirect } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';

export async function load(events: PageServerLoadEvent) {
	const session = await events.locals.auth();

	if (!session?.user?.id) redirect(307, '/auth/signin');

	return { session };
}
