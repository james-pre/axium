import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoadEvent } from './$types.js';

const noAuthPrefixes = ['/api', '/auth', '/favicon'];

export async function load(event: LayoutServerLoadEvent) {
	if (noAuthPrefixes.some(prefix => event.url.pathname.startsWith(prefix))) return;

	const session = await event.locals.auth();

	if (!session) throw redirect(307, '/auth/signin');

	return { session };
}
