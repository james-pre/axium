import type { NewSessionResponse } from '@axium/core/api';
import { userProtectedFields, userPublicFields, type User } from '@axium/core/user';
import { pick } from 'utilium';
import z from 'zod/v4';
import { createSession, getSessionAndUser, type SessionAndUser, type UserInternal } from './auth.js';
import { config } from './config.js';

import type { CookieParseOptions, CookieSerializeOptions } from 'cookie';
import type { RequestMethod } from '@axium/core/requests';

export interface Cookies {
	/**
	 * Gets a cookie that was previously set with `cookies.set`, or from the request headers.
	 * @param name the name of the cookie
	 * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
	 */
	get: (name: string, opts?: CookieParseOptions) => string | undefined;

	/**
	 * Gets all cookies that were previously set with `cookies.set`, or from the request headers.
	 * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
	 */
	getAll: (opts?: CookieParseOptions) => Array<{ name: string; value: string }>;

	/**
	 * Sets a cookie. This will add a `set-cookie` header to the response, but also make the cookie available via `cookies.get` or `cookies.getAll` during the current request.
	 *
	 * The `httpOnly` and `secure` options are `true` by default (except on http://localhost, where `secure` is `false`), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The `sameSite` option defaults to `lax`.
	 *
	 * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
	 * @param name the name of the cookie
	 * @param value the cookie value
	 * @param opts the options, passed directly to `cookie.serialize`. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
	 */
	set: (name: string, value: string, opts: CookieSerializeOptions & { path: string }) => void;

	/**
	 * Deletes a cookie by setting its value to an empty string and setting the expiry date in the past.
	 *
	 * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
	 * @param name the name of the cookie
	 * @param opts the options, passed directly to `cookie.serialize`. The `path` must match the path of the cookie you want to delete. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
	 */
	delete: (name: string, opts: CookieSerializeOptions & { path: string }) => void;

	/**
	 * Serialize a cookie name-value pair into a `Set-Cookie` header string, but don't apply it to the response.
	 *
	 * The `httpOnly` and `secure` options are `true` by default (except on http://localhost, where `secure` is `false`), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The `sameSite` option defaults to `lax`.
	 *
	 * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
	 *
	 * @param name the name of the cookie
	 * @param value the cookie value
	 * @param opts the options, passed directly to `cookie.serialize`. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
	 */
	serialize: (name: string, value: string, opts: CookieSerializeOptions & { path: string }) => string;
}

export type RequestParams = Partial<Record<string, string>>;

export interface AxiumRequest<Params extends RequestParams = RequestParams> {
	params: Params;
	cookies: Cookies;
	method: RequestMethod;
	url: URL;
	raw: Request;
}

export class HttpError extends Error {
	public body: { message: string };

	constructor(
		body: string | { message: string },
		public status: number = 500
	) {
		super(typeof body === 'string' ? body : body.message);
		this.body = typeof body === 'string' ? { message: body } : body;
	}

	toString() {
		return JSON.stringify(this.body);
	}
}

export function error(status: number, body: string | { message: string }): never {
	if (!config.debug && (isNaN(status) || status < 400 || status > 599)) {
		throw new Error(`HTTP error status codes must be between 400 and 599. ${status} is invalid`);
	}

	throw new HttpError(body, status);
}

const encoder = new TextEncoder();

export function json(data: any, init: ResponseInit = {}): Response {
	const body = JSON.stringify(data);

	const headers = new Headers(init?.headers);
	if (!headers.has('content-length')) {
		headers.set('content-length', encoder.encode(body).byteLength.toString());
	}

	if (!headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}

	return new Response(body, { ...init, headers });
}

export type RedirectStatus = 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | ({} & number);

export interface Redirect {
	status: RedirectStatus;
	location: string;
}

export function redirect(status: RedirectStatus, location: string | URL): never {
	if (!config.debug && (isNaN(status) || status < 300 || status > 308)) {
		throw new Error('Invalid status code');
	}

	throw { status, location: location.toString() } satisfies Redirect;
}

export function isRedirect(e: unknown): e is Redirect {
	return (e as Redirect).status !== undefined;
}

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(
	request: AxiumRequest,
	schema: Schema
): Promise<Result> {
	const contentType = request.raw.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, { message: 'Invalid content type' });

	const body: unknown = await request.raw.json().catch(() => error(415, { message: 'Invalid JSON' }));

	try {
		return schema.parse(body) as Result;
	} catch (e: any) {
		error(400, { message: z.prettifyError(e) });
	}
}

export function getToken(request: AxiumRequest, sensitive: boolean = false): string | undefined {
	const header_token = request.raw.headers.get('Authorization')?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || config.api.cookie_auth) {
		return request.cookies.get(sensitive ? 'elevated_token' : 'session_token');
	}
}

export async function checkAuth(request: AxiumRequest, userId: string, sensitive: boolean = false): Promise<SessionAndUser> {
	const token = getToken(request, sensitive);

	if (!token) throw error(401, { message: 'Missing token' });

	const session = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid or expired session' }));

	if (session.user?.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });

	if (!session.elevated && sensitive) error(403, 'This token can not be used for sensitive actions');

	return session;
}

export async function createSessionData(request: AxiumRequest, userId: string, elevated: boolean = false): Promise<NewSessionResponse> {
	const { token } = await createSession(userId, elevated);

	if (elevated) {
		request.cookies.set('elevated_token', token, { httpOnly: true, path: '/', expires: new Date(Date.now() + 10 * 60_000) });
		return { userId, token: '[[redacted:elevated]]' };
	} else {
		request.cookies.set('session_token', token, { httpOnly: config.auth.secure_cookies, path: '/' });
		return { userId, token };
	}
}

export function stripUser(user: UserInternal, includeProtected: boolean = false): User {
	return pick(user, ...userPublicFields, ...(includeProtected ? userProtectedFields : []));
}

export function withError(text: string, code: number = 500) {
	return function (e: Error) {
		error(code, text + (config.debug ? `: ${e.message}` : ''));
	};
}
