import type { Result, UserInternal } from '@axium/core';
import { AuditFilter, Severity } from '@axium/core';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import { audit, getEvents } from '../audit.js';
import { getSessionAndUser } from '../auth.js';
import config, { type Config } from '../config.js';
import { database as db } from '../database.js';
import { error, getToken, withError } from '../requests.js';
import { addRoute, type RouteCommon } from '../routes.js';

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
	async GET(req): Result<'GET', 'admin/users'> {
		await assertAdmin(this, req);

		const users: UserInternal[] = await db.selectFrom('users').selectAll().execute();

		return users;
	},
});

/**
 * Redacts critical information that we don't want to send over the API, even to admins.
 */
function _redactConfig(config: Config): Config {
	if (config.db?.password) {
		config.db.password = '*'.repeat(config.db.password.length);
	}

	return config;
}

addRoute({
	path: '/api/admin/config',
	async GET(req): Result<'GET', 'admin/config'> {
		await assertAdmin(this, req);

		return {
			config: _redactConfig(config.plain()),
			files: Object.fromEntries(config.files.entries().map(([path, cfg]) => [path, _redactConfig(cfg)])),
		};
	},
});

addRoute({
	path: '/api/admin/audit/events',
	async GET(req): Result<'GET', 'admin/audit/events'> {
		await assertAdmin(this, req);

		const filter: AuditFilter = { severity: Severity.Info };
		try {
			const search = Object.fromEntries(new URL(req.url).searchParams);
			Object.assign(filter, AuditFilter.parse(search));
		} catch (e: any) {
			error(400, e instanceof z.core.$ZodError ? z.prettifyError(e) : 'invalid body');
		}

		return await getEvents(filter)
			.select(eb =>
				jsonObjectFrom(eb.selectFrom('users').whereRef('users.id', '=', 'audit_log.userId').select(['id', 'name'])).as('user')
			)
			.execute();
	},
});

addRoute({
	path: '/api/admin/audit/:eventId',
	params: { eventId: z.uuid() },
	async GET(req, params): Result<'GET', 'admin/audit/:eventId'> {
		await assertAdmin(this, req);

		if (!params.eventId) error(400, 'Missing event ID');

		const event = await db
			.selectFrom('audit_log')
			.selectAll()
			.select(eb =>
				jsonObjectFrom(eb.selectFrom('users').whereRef('users.id', '=', 'audit_log.userId').selectAll())
					.$castTo<UserInternal | null | undefined>()
					.as('user')
			)
			.where('id', '=', params.eventId)
			.executeTakeFirstOrThrow()
			.catch(withError('Audit event not found', 404));

		return event;
	},
});
