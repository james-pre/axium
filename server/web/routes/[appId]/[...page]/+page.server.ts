import { error, type LoadEvent } from '@sveltejs/kit';
import { apps } from '@axium/server/apps.js';

export async function load(event: LoadEvent) {
	const app = apps.get(event.params.appId);

	if (!app) error(404);

	const route = app.resolveRoute(event);

	if (!route) error(404);

	return await route.load(event);
}
