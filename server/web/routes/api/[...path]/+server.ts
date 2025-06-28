import type { RequestMethod } from '@axium/core/requests';
import { resolveRoute } from '@axium/server/routes.js';
import { config } from '@axium/server/config.js';
import { error, json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import z from 'zod/v4';

function handler(method: RequestMethod): RequestHandler {
	return async function (event: RequestEvent): Promise<Response> {
		const _warnings: string[] = [];
		if (!event.request.headers.get('Accept')?.includes('application/json')) {
			_warnings.push('Only application/json is supported');
			event.request.headers.set('Accept', 'application/json');
		}

		const route = resolveRoute(event);

		if (!route) error(404, 'Route not found');
		if (!route.server) error(503, 'Route is not a server route');

		if (config.debug) console.log(event.request.method, route.path);

		for (const [key, type] of Object.entries(route.params || {})) {
			if (!type) continue;

			try {
				event.params[key] = type.parse(event.params[key]) as any;
			} catch (e) {
				error(400, `Invalid parameter: ${z.prettifyError(e)}`);
			}
		}

		if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${route.path}`);

		const result: object & { _warnings?: string[] } = await route[method](event);

		result._warnings ||= [];
		result._warnings.push(..._warnings);

		return json(result);
	};
}

export const HEAD = handler('HEAD');
export const GET = handler('GET');
export const POST = handler('POST');
export const PUT = handler('PUT');
export const DELETE = handler('DELETE');
export const PATCH = handler('PATCH');
export const OPTIONS = handler('OPTIONS');
