import { createSession, deleteSession, getSessionAndUser } from './auth.js';
import { config } from './config.js';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod/v4';

export async function parseBody<const Schema extends z.ZodType, const Result extends z.infer<Schema> = z.infer<Schema>>(event: RequestEvent, schema: Schema): Promise<Result> {
	const contentType = event.request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) error(415, { message: 'Invalid content type' });

	const body: unknown = await event.request.json().catch(() => error(415, { message: 'Invalid JSON' }));

	return (await schema.parseAsync(body).catch(() => error(400, { message: 'Invalid request body' }))) as Result;
}

export async function checkAuth(event: RequestEvent, userId?: string): Promise<void> {
	const token = event.request.headers.get('Authorization')?.replace('Bearer ', '');

	if (!token) throw error(401, { message: 'Missing token' });

	const { session, user } = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid token' }));

	if (session.expires.getTime() < Date.now()) {
		await deleteSession(token);
		error(403, { message: 'Session expired' });
	}

	if (user.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });
}

export async function createSessionResponse(event: RequestEvent, userId: string): Promise<Response> {
	const { token } = await createSession(userId);

	if (config.auth.secure_cookies) {
		event.cookies.set('session_token', token, { httpOnly: true, path: '/' });
	}

	return json({ userId, token });
}
