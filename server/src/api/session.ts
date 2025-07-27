import type { Result } from '@axium/core/api';
import { error } from '@sveltejs/kit';
import { omit } from 'utilium';
import { getSessionAndUser } from '../auth.js';
import { connect, database as db } from '../database.js';
import { getToken, stripUser, withError } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/api/session',
	async GET(event): Result<'GET', 'session'> {
		const token = getToken(event);
		if (!token) error(401, 'Missing token');

		const result = await getSessionAndUser(token).catch(withError('Invalid session', 400));

		return {
			...omit(result, 'token'),
			user: stripUser(result.user, true),
		};
	},
	async DELETE(event): Result<'DELETE', 'session'> {
		const token = getToken(event);
		if (!token) error(401, 'Missing token');
		connect();
		const result = await db
			.deleteFrom('sessions')
			.where('sessions.token', '=', token)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch((e: Error) => (e.message == 'no result' ? error(404, 'Session does not exist') : error(400, 'Invalid session')));

		return omit(result, 'token');
	},
});
