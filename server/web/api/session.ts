import { authenticate } from '$lib/auth';
import type { Result } from '@axium/core/api';
import { database as db } from '@axium/server/database.js';
import { addRoute } from '@axium/server/routes.js';
import { error } from '@sveltejs/kit';
import { pick } from 'utilium';
import { getToken, stripUser } from './utils';

addRoute({
	path: '/api/session',
	async GET(event): Promise<Result<'GET', 'session'>> {
		const result = await authenticate(event);

		if (!result) error(404, 'Session does not exist');

		return {
			session: pick(result.session, 'id', 'expires'),
			user: stripUser(result.user, true),
		};
	},
	async DELETE(event): Promise<Result<'DELETE', 'session'>> {
		const token = getToken(event);
		return await db.deleteFrom('sessions').where('sessions.token', '=', token).returningAll().executeTakeFirstOrThrow();
	},
});
