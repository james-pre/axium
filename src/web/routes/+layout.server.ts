import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoadEvent } from './$types';

export async function load(event: LayoutServerLoadEvent) {
	if (event.url.pathname.startsWith('/api') || event.url.pathname.startsWith('/auth') || event.url.pathname.startsWith('/favicon')) {
		return;
	}

	const session = await event.locals.auth();

	if (!session) {
		throw redirect(307, '/auth/signin');
	}

	return { session };
}
