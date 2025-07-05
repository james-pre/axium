import type { NewSessionResponse } from '@axium/core/api';
import type { RequestMethod } from '@axium/core/requests';
import { userProtectedFields, userPublicFields, type User } from '@axium/core/user';
import { error, isHttpError, json, redirect, type HttpError, type RequestEvent, type ResolveOptions } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import { render } from 'svelte/server';
import { pick } from 'utilium';
import z from 'zod/v4';
import { createSession, getSessionAndUser, type SessionAndUser, type UserInternal } from './auth.js';
import { config } from './config.js';
import { resolveRoute, type ServerRoute } from './routes.js';

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(
	event: RequestEvent,
	schema: Schema
): Promise<Result> {
	const contentType = event.request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, { message: 'Invalid content type' });

	const body: unknown = await event.request.json().catch(() => error(415, { message: 'Invalid JSON' }));

	try {
		return schema.parse(body) as Result;
	} catch (e: any) {
		error(400, { message: z.prettifyError(e) });
	}
}

export function getToken(event: RequestEvent, sensitive: boolean = false): string | undefined {
	const header_token = event.request.headers.get('Authorization')?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || config.api.cookie_auth) {
		return event.cookies.get(sensitive ? 'elevated_token' : 'session_token');
	}
}

export async function checkAuth(event: RequestEvent, userId: string, sensitive: boolean = false): Promise<SessionAndUser> {
	const token = getToken(event, sensitive);

	if (!token) throw error(401, { message: 'Missing token' });

	const session = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid or expired session' }));

	if (session.user?.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });

	if (!session.elevated && sensitive) error(403, 'This token can not be used for sensitive actions');

	return session;
}

export async function createSessionData(event: RequestEvent, userId: string, elevated: boolean = false): Promise<NewSessionResponse> {
	const { token } = await createSession(userId, elevated);

	if (elevated) {
		event.cookies.set('elevated_token', token, { httpOnly: true, path: '/', expires: new Date(Date.now() + 10 * 60_000) });
		return { userId, token: '[[redacted:elevated]]' };
	} else {
		event.cookies.set('session_token', token, { httpOnly: config.auth.secure_cookies, path: '/' });
		return { userId, token };
	}
}

export function stripUser(user: UserInternal, includeProtected: boolean = false): User {
	return pick(user, ...userPublicFields, ...(includeProtected ? userProtectedFields : []));
}

export function withError(text: string, code: number = 500) {
	return function (e: Error) {
		error(code, { message: text + (config.debug ? `: ${e.message}` : '') });
	};
}

async function handleAPIRequest(event: RequestEvent, route: ServerRoute): Promise<Response> {
	const method = event.request.method as RequestMethod;

	const _warnings: string[] = [];
	if (route.api && !event.request.headers.get('Accept')?.includes('application/json')) {
		_warnings.push('Only application/json is supported');
		event.request.headers.set('Accept', 'application/json');
	}

	for (const [key, type] of Object.entries(route.params || {})) {
		if (!type) continue;

		try {
			event.params[key] = type.parse(event.params[key]) as any;
		} catch (e: any) {
			error(400, `Invalid parameter: ${z.prettifyError(e)}`);
		}
	}

	if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${route.path}`);

	const result: (object & { _warnings?: string[] }) | Response = await route[method](event);

	if (result instanceof Response) return result;

	result._warnings ||= [];
	result._warnings.push(..._warnings);

	return json(result);
}

function failure(e: Error) {
	console.error(e);
	return json({ message: 'Internal Error' + (config.debug ? ': ' + e.message : '') }, { status: 500 });
}

function handleError(e: Error | HttpError) {
	if (!isHttpError(e)) return failure(e);
	console.error(e);
	return json(e.body, { status: e.status });
}

const templatePath = join(import.meta.dirname, '../web/template.html');
const template = readFileSync(templatePath, 'utf-8');

function fillTemplate({ head, body }: Record<'head' | 'body', string>, env: Record<string, string> = {}, nonce: string = ''): string {
	return (
		template
			.replace('%sveltekit.head%', head)
			.replace('%sveltekit.body%', body)
			.replace(/%sveltekit\.assets%/g, config.web.assets)
			// Unused for now.
			.replace(/%sveltekit\.nonce%/g, nonce)
			.replace(/%sveltekit\.env\.([^%]+)%/g, (_match, capture) => env[capture] ?? '')
	);
}

/**
 * @internal
 */
export async function handle({
	event,
	resolve,
}: {
	event: RequestEvent;
	resolve: (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;
}) {
	const route = resolveRoute(event);

	if (!route && event.url.pathname === '/') redirect(303, '/_axium/default');

	if (config.debug) console.log(event.request.method.padEnd(7), route ? route.path : event.url.pathname);

	if (!route) return await resolve(event).catch(handleError);

	if (route.server == true) {
		if (route.api) return await handleAPIRequest(event, route).catch(handleError);

		try {
			const run = route[event.request.method as RequestMethod];
			if (typeof run !== 'function') {
				error(405, `Method ${event.request.method} not allowed for ${route.path}`);
			}
			const result = await run(event);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e: any) {
			return failure(e);
		}
	}

	const data = await route.load?.(event);

	const body = fillTemplate(render(route.page));

	return new Response(body, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			Pragma: 'no-cache',
			Expires: '0',
		},
		status: 200,
	});
}
