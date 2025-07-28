import { userProtectedFields, userPublicFields, type User } from '@axium/core/user';
import type { Cookies as SK_Cookies } from '@sveltejs/kit';
import { serialize as serializeCookie } from 'cookie';
import { pick } from 'utilium';
import * as z from 'zod';
import { createSession, type UserInternal } from './auth.js';
import { config } from './config.js';

export interface RequestEvent<Params extends Partial<Record<string, string>> = Partial<Record<string, string>>> {
	request: Request;
	url: URL;
	params: Params;
	cookies: SK_Cookies;
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
		response.headers.set('content-length', JSON.stringify(data).length.toString());
	}

	return response;
}

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(
	event: RequestEvent,
	schema: Schema
): Promise<Result> {
	const contentType = event.request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, 'Invalid content type');

	const body: unknown = await event.request.json().catch(() => error(415, 'Invalid JSON'));

	try {
		return schema.parse(body) as Result;
	} catch (e: any) {
		error(400, z.prettifyError(e));
	}
}

export function getToken(event: RequestEvent, sensitive: boolean = false): string | undefined {
	const header_token = event.request.headers.get('Authorization')?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || config.api.cookie_auth) {
		return event.cookies.get(sensitive ? 'elevated_token' : 'session_token');
	}
}

export async function createSessionData(userId: string, elevated: boolean = false): Promise<Response> {
	const { token, expires } = await createSession(userId, elevated);

	const response = json({ userId, token: elevated ? '[[redacted:elevated]]' : token }, { status: 201 });

	const cookies = serializeCookie(elevated ? 'elevated_token' : 'session_token', token, {
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
