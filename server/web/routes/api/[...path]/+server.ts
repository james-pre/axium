import { resolveRoute, type RequestMethod, type Route } from '@axium/server/routes.js';
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '../../$types';
import z from 'zod/v4';

const acceptable = (event: RequestEvent): boolean => event.request.headers.get('Accept')?.includes('application/json');

const badAccept = json({ message: 'Only application/json is supported' }, { status: 406 });

function getRoute(event: RequestEvent, method: RequestMethod): Route {
	const route = resolveRoute(event);
	if (!route) error(404, 'Route not found');
	for (const [key, { type }] of Object.entries(route.params)) {
		if (!type) continue;

		try {
			event.params[key] = type.parse(event.params[key]);
		} catch (e) {
			error(400, `Invalid parameter: ${z.prettifyError(e)}`);
		}
	}

	if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${event.url.pathname}`);

	return route;
}

export async function GET(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'GET');
	return json(await route.GET(event));
}

export async function POST(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'POST');
	return json(await route.POST(event));
}

export async function PUT(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'PUT');
	return json(await route.PUT(event));
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'DELETE');
	return json(await route.DELETE(event));
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'PATCH');
	return json(await route.PATCH(event));
}

export async function OPTIONS(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'OPTIONS');
	return json(await route.OPTIONS(event));
}

export async function HEAD(event: RequestEvent): Promise<Response> {
	if (!acceptable(event)) return badAccept;
	const route = getRoute(event, 'HEAD');
	return json(await route.HEAD(event));
}
