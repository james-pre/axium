import type { UserInternal } from '@axium/core';
import type { APIParameters, Endpoint, RequestBody, Result } from '@axium/core/api';
import { randomUUID } from 'node:crypto';
import { $API } from '@axium/core/api';
import type { RequestMethod } from '@axium/core/requests';
import type * as z from 'zod';
import { delegate, type SessionAndUser } from './auth.js';
import { error, handleAPIRequest } from './requests.js';
import { resolveRoute } from './routes.js';

/**
 * Calls an API route as `user`, with the same validation and access checks as a request from them.
 * Routes that need an elevated session refuse these calls.
 * @throws `ResponseError` when the route responds with an error
 */
export async function callAPI<const E extends Endpoint, const M extends keyof $API[E] & RequestMethod>(
	user: UserInternal,
	method: M,
	endpoint: E,
	data?: RequestBody<M, E>,
	...params: APIParameters<E>
): Promise<Result<M, E>> {
	const schema = $API[endpoint]?.[method] as z.ZodType | [z.ZodType, z.ZodType] | undefined;

	const parts: string[] = [];
	for (const part of endpoint.split('/')) {
		if (!part.startsWith(':')) {
			parts.push(part);
			continue;
		}
		const value = (params as string[]).shift();
		if (!value) error(400, `Missing parameter "${part.slice(1)}"`);
		parts.push(encodeURIComponent(value));
	}

	const url = new URL('/api/' + parts.join('/'), 'http://localhost');
	const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };

	if (method == 'GET' || method == 'HEAD') {
		for (const [key, value] of Object.entries(data ?? {})) url.searchParams.set(key, JSON.stringify(value));
	} else {
		init.body = JSON.stringify(Array.isArray(schema) ? schema[0].parse(data) : data);
	}

	const now = new Date();
	const session: SessionAndUser = {
		id: randomUUID(),
		userId: user.id,
		user,
		name: null,
		token: '',
		elevated: false,
		created: now,
		expires: now,
	};

	const request = new Request(url, init);
	delegate(request, session);

	const [route, routeParams] = resolveRoute(url) ?? error(404, `No route for ${endpoint}`);
	if (!route.server || !route.api) error(404, `${endpoint} is not an API route`);

	const response = await handleAPIRequest(request, routeParams, route);
	const json = await response.json().catch(() => error(502, `${method} ${endpoint} did not respond with JSON`));

	if (!response.ok) error(response.status, json?.message ?? response.statusText);

	if (!schema) return json;

	return (Array.isArray(schema) ? schema[1] : schema).parse(json) as Result<M, E>;
}
