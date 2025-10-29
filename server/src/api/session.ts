import type { AsyncResult } from '@axium/core/api';
import { omit } from 'utilium';
import { audit } from '../audit.js';
import { getSessionAndUser } from '../auth.js';
import { database as db } from '../database.js';
import { error, getToken, stripUser, withError } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/api/session',
	async GET(request): AsyncResult<'GET', 'session'> {
		const token = getToken(request);
		if (!token) error(401, 'Missing token');

		const result = await getSessionAndUser(token).catch(withError('Invalid session', 400));

		return {
			...omit(result, 'token'),
			user: stripUser(result.user, true),
		};
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
