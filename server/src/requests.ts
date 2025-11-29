import type { RequestMethod, User, UserInternal } from '@axium/core';
import { userProtectedFields, userPublicFields } from '@axium/core/user';
import * as cookie from 'cookie_v1';
import { pick } from 'utilium';
import * as z from 'zod';
import { createSession } from './auth.js';
import { config } from './config.js';
import type { ServerRoute } from './routes.js';

/**
 * @todo Add parsing for Node.js `IncomingMessage` -> standard `Request` and standard `Response` -> Node.js `ServerResponse`
 */

/**
 * A `Request` with some commonly used stuff pre-parsed for convenience.
 * @deprecated
 */
export interface RequestEvent<Params extends Partial<Record<string, string>> = Partial<Record<string, string>>> {
	request: Request;
	url: URL;
	params: Params;
	cookies: any;
}

export interface ResponseError extends Error {
	status: number;
	name: 'ResponseError';
	responseMessage?: string;
}

export function isResponseError(e: unknown): e is ResponseError {
	return e instanceof Error && e.name === 'ResponseError' && typeof (e as ResponseError).status === 'number';
}

export function error(status: number, message: string): never {
	const error = Object.assign(new Error(message), { status });
	error.name = 'ResponseError';
	throw error;
}

export interface Redirect {
	location: string;
	status: number;
}

export function isRedirect(e: unknown): e is Redirect {
	return typeof e === 'object' && e !== null && 'location' in e && 'status' in e;
}

/**
 * Use `Response.redirect` if you can.
 * This should only when `return`ing a `Response` is not possible.
 */
export function redirect(location: string, status: number = 302): never {
	throw { location, status };
}

export function json(data: object, init?: ResponseInit): Response {
	const response = Response.json(data, init);

	if (!response.headers.has('content-length')) {
		response.headers.set('content-length', new TextEncoder().encode(JSON.stringify(data)).length.toString());
	}

	return response;
}

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(
	request: Request,
	schema: Schema
): Promise<Result> {
	const contentType = request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, 'Invalid content type');

	const body: unknown = await request.json().catch(() => error(415, 'Invalid JSON'));

	try {
		return schema.parse(body) as Result;
	} catch (e: any) {
		error(400, e instanceof z.core.$ZodError ? z.prettifyError(e) : 'invalid body');
	}
}

export function getToken(request: Request, sensitive: boolean = false): string | undefined {
	const header_token = request.headers.get('Authorization')?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || !config.auth.header_only) {
		return cookie.parse(request.headers.get('cookie') || '')[sensitive ? 'elevated_token' : 'session_token'];
	}
}

export interface CreateSessionOptions {
	elevated?: boolean;
	noCookie?: boolean;
}

export async function createSessionData(userId: string, { elevated = false, noCookie }: CreateSessionOptions = {}): Promise<Response> {
	const { token, expires } = await createSession(userId, elevated);

	const response = json({ userId, token: elevated ? '[[redacted:elevated]]' : token }, { status: 201 });

	if (noCookie) return response;

	const cookies = cookie.serialize(elevated ? 'elevated_token' : 'session_token', token, {
		httpOnly: true,
		path: '/',
		expires,
		secure: config.auth.secure_cookies,
		sameSite: 'lax',
	});

	response.headers.set('Set-Cookie', cookies);
	return response;
}

export function stripUser(user: UserInternal, includeProtected: boolean = false): User {
	return pick(user, ...userPublicFields, ...(includeProtected ? userProtectedFields : []));
}

export function withError(text: string, code: number = 500) {
	return function (e: Error | ResponseError) {
		if (e.name == 'ResponseError') throw e;
		error(code, text + (config.debug && e.message ? `: ${e.message}` : ''));
	};
}

export async function handleAPIRequest(request: Request, params: Record<string, any>, route: ServerRoute): Promise<Response> {
	const method = request.method as RequestMethod;

	const _warnings: string[] = [];
	if (route.api && !request.headers.get('Accept')?.includes('application/json')) {
		_warnings.push('Only application/json is supported');
		request.headers.set('Accept', 'application/json');
	}

	for (const [key, type] of Object.entries(route.params || {})) {
		if (!type) continue;

		try {
			params[key] = type.parse(params[key]) as any;
		} catch (e: any) {
			error(400, `Invalid parameter: ${e instanceof z.core.$ZodError ? z.prettifyError(e) : '<unknown error>'}`);
		}
	}

	if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${route.path}`);

	const result: void | (object & { _warnings?: string[] }) | Response = await route[method].call(route, request, params);

	if (result instanceof Response) return result;

	if (typeof result == 'object' || typeof result == 'function') {
		result._warnings ||= [];
		result._warnings.push(..._warnings);
	}

	return json(result);
}

export function handleResponseError(e: Error | ResponseError | Redirect) {
	if (isResponseError(e)) return json({ message: e.message }, { status: e.status });
	if (isRedirect(e)) return Response.redirect(e.location, e.status);
	console.error(e);
	return json({ message: 'Internal Error' + (config.debug ? ': ' + e.message : '') }, { status: 500 });
}

export const noCacheHeaders = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'no-cache, no-store, must-revalidate',
	Pragma: 'no-cache',
	Expires: '0',
};
