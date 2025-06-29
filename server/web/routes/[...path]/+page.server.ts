import { error, redirect, type LoadEvent } from '@sveltejs/kit';
import { resolveRoute } from '@axium/server/routes.js';

export async function load(event: LoadEvent) {
	const route = resolveRoute(event);

	if (!route && event.url.pathname === '/') redirect(303, '/_axium/default');
	if (!route) error(404);

	if (route.server == true) error(409, 'This is a server route, not a page route');

	return await route.load(event);
}
