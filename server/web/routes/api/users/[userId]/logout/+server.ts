import { checkAuth, parseBody } from '@axium/server/api.js';
import { getUser } from '@axium/server/auth.js';
import { connect, database as db } from '@axium/server/database.js';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import z from 'zod/v4';

export async function POST(event: RequestEvent): Promise<Response> {
	const { userId } = event.params;
	const { sessionId } = await parseBody(event, z.object({ sessionId: z.uuid() }));

	const user = await getUser(userId);
	if (!user) error(404, { message: 'User does not exist' });

	await checkAuth(event, userId);

	connect();

	const session = await db
		.selectFrom('sessions')
		.selectAll()
		.where('id', '=', sessionId)
		.executeTakeFirstOrThrow()
		.catch(() => error(404, { message: 'Invalid session' }));

	if (session.userId !== userId) error(403, { message: 'Session does not belong to the user' });

	await db
		.deleteFrom('sessions')
		.where('sessions.id', '=', session.id)
		.executeTakeFirstOrThrow()
		.catch(() => error(500, { message: 'Failed to delete session' }));

	return json({ userId });
}
