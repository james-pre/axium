import { authenticate } from '$lib/auth';
import type { Result } from '@axium/core/api';
import { connect, database as db } from '@axium/server/database';
import { addRoute } from '@axium/server/routes';
import { getToken, stripUser } from '@axium/server/utils';
import { error } from '@sveltejs/kit';
import { omit } from 'utilium';

addRoute({
	path: '/api/session',
	async GET(event): Result<'GET', 'session'> {
		const result = await authenticate(event);

		if (!result) error(404, 'Session does not exist');

		return {
			...omit(result, 'token'),
			user: stripUser(result.user, true),
		};
	},
	async DELETE(event): Result<'DELETE', 'session'> {
		const token = getToken(event);
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
