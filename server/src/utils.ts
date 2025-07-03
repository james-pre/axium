import { userProtectedFields, userPublicFields, type User } from '@axium/core/user';
import type { NewSessionResponse } from '@axium/core/api';
import { createSession, getSessionAndUser, type UserInternal } from './auth.js';
import { config } from './config.js';
import { error, type RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import z from 'zod/v4';

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

export async function checkAuth(event: RequestEvent, userId: string, sensitive: boolean = false): Promise<void> {
	const token = getToken(event, sensitive);

	if (!token) throw error(401, { message: 'Missing token' });

	const { user, elevated } = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid or expired session' }));

	if (user?.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });

	if (!elevated && sensitive) error(403, 'This token can not be used for sensitive actions');
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
