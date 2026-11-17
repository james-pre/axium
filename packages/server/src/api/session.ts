import { SessionUpdate } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import { omit } from 'utilium';
import { audit } from '../audit.js';
import { getSessionAndUser, setTimeZone, type SessionAndUser } from '../auth.js';
import { database as db } from '../db/index.js';
import { error, getToken, parseBody, stripUser, withError } from '../requests.js';
import { addRoute } from '../routes.js';

async function currentSession(request: Request): Promise<SessionAndUser> {
	const token = getToken(request);
	if (!token) error(401, 'Missing token');

	return await getSessionAndUser(token).catch(withError('Invalid session', 400));
}

function toResult(session: SessionAndUser) {
	return { ...omit(session, 'token'), user: stripUser(session.user, true) };
}

addRoute({
	path: '/api/session',
	async GET(request): AsyncResult<'GET', 'session'> {
		return toResult(await currentSession(request));
	},
	async POST(request): AsyncResult<'POST', 'session'> {
		const { timezone } = await parseBody(request, SessionUpdate);
		const session = await currentSession(request);

		await setTimeZone(session, timezone).catch(withError('Could not save the time zone'));

		return toResult(session);
	},
	async DELETE(request): AsyncResult<'DELETE', 'session'> {
		const token = getToken(request);
		if (!token) error(401, 'Missing token');

		const result = await db
			.deleteFrom('sessions')
			.where('sessions.token', '=', token)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch((e: Error) => (e.message == 'no result' ? error(404, 'Session does not exist') : error(400, 'Invalid session')));

		await audit('logout', result.userId, { sessions: [result.id] });
		return omit(result, 'token');
	},
});
