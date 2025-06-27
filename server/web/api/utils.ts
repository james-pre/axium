import type { User } from '@axium/core';
import type { NewSessionResponse } from '@axium/core/api';
import { createSession, getSessionAndUser } from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { error, type RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import z from 'zod/v4';

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(event: RequestEvent, schema: Schema): Promise<Result> {
	const contentType = event.request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, { message: 'Invalid content type' });

	const body: unknown = await event.request.json().catch(() => error(415, { message: 'Invalid JSON' }));

	try {
		return schema.parse(body) as Result;
	} catch (e: any) {
		error(400, { message: z.prettifyError(e) });
	}
}

export function getToken(event: RequestEvent): string | null {
	const header_token = event.request.headers.get('Authorization')?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || config.api.cookie_auth) {
		return event.cookies.get('session_token');
	}

	return null;
}

export async function checkAuth(event: RequestEvent, userId?: string): Promise<void> {
	const token = getToken(event);

	if (!token) throw error(401, { message: 'Missing token' });

	const { user } = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid or expired session' }));

	if (user.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });
}

export async function createSessionResponse(event: RequestEvent, userId: string): Promise<NewSessionResponse> {
	const { token } = await createSession(userId);

	if (config.auth.secure_cookies) {
		event.cookies.set('session_token', token, { httpOnly: true, path: '/' });
	}

	return { userId, token };
}

export function stripUser(user: User, includeProtected: boolean = false) {
	return pick(
		user,
		...(['id', 'name', 'image'] as const satisfies (keyof User)[]),
		...(includeProtected ? (['email', 'emailVerified', 'preferences'] as const satisfies (keyof User)[]) : [])
	);
}
