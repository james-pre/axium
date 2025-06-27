import { error, type RequestEvent } from '@sveltejs/kit';
import z from 'zod/v4';
import { createSession, deleteSession, getSessionAndUser } from '../auth.js';
import { config } from '../config.js';

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

export async function checkAuth(event: RequestEvent, userId?: string): Promise<void> {
	const token = event.request.headers.get('Authorization')?.replace('Bearer ', '') || (config.debug ? event.cookies.get('session_token') : null);

	if (!token) throw error(401, { message: 'Missing token' });

	const { session, user } = await getSessionAndUser(token).catch(() => error(401, { message: 'Invalid token' }));

	if (session.expires.getTime() < Date.now()) {
		await deleteSession(token);
		error(403, { message: 'Session expired' });
	}

	if (user.id !== userId /* && !user.isAdmin */) error(403, { message: 'User ID mismatch' });
}

export async function createSessionResponse(event: RequestEvent, userId: string) {
	const { token } = await createSession(userId);

	if (config.auth.secure_cookies) {
		event.cookies.set('session_token', token, { httpOnly: true, path: '/' });
	}

	return { userId, token };
}
