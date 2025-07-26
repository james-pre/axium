import { userProtectedFields, userPublicFields, type User } from '@axium/core/user';
import { error, json, type HttpError, type RequestEvent } from '@sveltejs/kit';
import { serialize as serializeCookie } from 'cookie';
import { pick } from 'utilium';
import * as z from 'zod';
import { createSession, getSessionAndUser, getUser, type SessionAndUser, type UserInternal } from './auth.js';
import { config } from './config.js';

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

export interface AuthResult extends SessionAndUser {
	/** The user authenticating the request. */
	accessor: UserInternal;
}

export async function checkAuth(event: RequestEvent, userId: string, sensitive: boolean = false): Promise<AuthResult> {
	const token = getToken(event, sensitive);

	if (!token) throw error(401, { message: 'Missing token' });

	const session = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid or expired session' }));

	if (session.userId !== userId) {
		if (!session.user?.isAdmin) error(403, { message: 'User ID mismatch' });

		// Admins are allowed to manage other users.
		const accessor = session.user;
		session.user = await getUser(userId).catch(() => error(404, { message: 'Target user not found' }));

		return Object.assign(session, { accessor });
	}

	if (!session.elevated && sensitive) error(403, 'This token can not be used for sensitive actions');

	return Object.assign(session, { accessor: session.user });
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
	return function (e: Error | HttpError) {
		if ('body' in e) throw e;
		error(code, { message: text + (config.debug && e.message ? `: ${e.message}` : '') });
	};
}
