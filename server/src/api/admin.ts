import type { Result, UserInternal } from '@axium/core';
import { audit, getEvents } from '../audit.js';
import { getSessionAndUser } from '../auth.js';
import { database as db } from '../database.js';
import { error, getToken, parseBody, withError } from '../requests.js';
import { addRoute, type RouteCommon } from '../routes.js';
import config from '../config.js';
import { AuditFilter } from '@axium/core';

async function assertAdmin(route: RouteCommon, req: Request): Promise<UserInternal> {
	const token = getToken(req);
	if (!token) error(401, 'Missing token');

	const admin = await getSessionAndUser(token).catch(withError('Invalid session', 400));
	if (!admin.user.isAdmin) error(403, 'Not an administrator');

	if (!config.admin_api) error(503, 'Admin API is disabled');

	await audit('admin_api', admin.userId, { route: route.path, session: admin.id });

	return admin.user;
}

addRoute({
	path: '/api/admin/users',
	async GET(req: Request): Result<'GET', 'admin/users'> {
		await assertAdmin(this, req);

		const users: UserInternal[] = await db.selectFrom('users').selectAll().execute();

		return users;
	},
});

addRoute({
	path: '/api/admin/config',
	async GET(req: Request): Result<'GET', 'admin/config'> {
		await assertAdmin(this, req);

		return {
			config: config.plain(),
			files: Object.fromEntries(config.files),
		};
	},
});

addRoute({
	path: '/api/admin/audit',
	async POST(req: Request): Result<'POST', 'admin/audit'> {
		await assertAdmin(this, req);

		const filter = await parseBody(req, AuditFilter);

		return await getEvents(filter);
	},
});
