import type { PluginInternal, AsyncResult, UserInternal } from '@axium/core';
import { AuditFilter, Severity } from '@axium/core';
import { plugins } from '@axium/core/plugins';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { omit } from 'utilium';
import * as z from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { audit, events, getEvents } from '../audit.js';
import { getSessionAndUser, type SessionInternal } from '../auth.js';
import { config, type Config } from '../config.js';
import { count, database as db } from '../database.js';
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
	path: '/api/admin/summary',
	async GET(req): AsyncResult<'GET', 'admin/summary'> {
		await assertAdmin(this, req);

		const groups = Object.groupBy(await getEvents({}).execute(), e => e.severity);
		const auditEvents = Object.fromEntries(Object.entries(groups).map(([sev, events]) => [sev, events.length])) as Record<
			keyof typeof Severity,
			number
		>;

		return {
			...(await count('users', 'passkeys', 'sessions')),
			auditEvents,
			configFiles: config.files.size,
			plugins: plugins.size,
			version: pkg.version,
		};
	},
});

addRoute({
	path: '/api/admin/plugins',
	async GET(req): AsyncResult<'GET', 'admin/plugins'> {
		await assertAdmin(this, req);

		return Array.from(plugins.values()).map(p => omit(p, '_hooks') as PluginInternal);
	},
});

addRoute({
	path: '/api/admin/users/all',
	async GET(req): AsyncResult<'GET', 'admin/users/all'> {
		await assertAdmin(this, req);

		const users: UserInternal[] = await db.selectFrom('users').selectAll().execute();

		return users;
	},
});

addRoute({
	path: '/api/admin/users/:userId',
	params: { userId: z.uuid() },
	async GET(req, { userId }): AsyncResult<'GET', 'admin/users/:userId'> {
		await assertAdmin(this, req);

		if (!userId) error(400, 'Missing user ID');

		const user = await db
			.selectFrom('users')
			.selectAll()
			.select(eb =>
				jsonArrayFrom(eb.selectFrom('sessions').whereRef('sessions.userId', '=', 'users.id').selectAll())
					.$castTo<SessionInternal[]>()
					.as('sessions')
			)
			.where('id', '=', userId)
			.executeTakeFirstOrThrow()
			.catch(withError('User not found', 404));

		return {
			...user,
			sessions: user.sessions.map(s => ({
				...omit(s, 'token'),
				created: new Date(s.created),
				expires: new Date(s.expires),
			})),
		};
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
	async GET(req): AsyncResult<'GET', 'admin/config'> {
		await assertAdmin(this, req);

		return {
			config: _redactConfig(config.plain()),
			files: Object.fromEntries(config.files.entries().map(([path, cfg]) => [path, _redactConfig(cfg)])),
		};
	},
});

addRoute({
	path: '/api/admin/audit/events',
	async OPTIONS(req): AsyncResult<'OPTIONS', 'admin/audit/events'> {
		await assertAdmin(this, req);

		if (config.audit.allow_raw) return false;

		const tags = new Set<string>(),
			source = new Set<string>(),
			name: string[] = [];

		for (const event of events.values()) {
			for (const tag of event.tags) tags.add(tag);
			source.add(event.source);
			name.push(event.name);
		}

		return {
			tags: Array.from(tags),
			source: Array.from(source),
			name: name,
		};
	},
	async GET(req): AsyncResult<'GET', 'admin/audit/events'> {
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
	async GET(req, { eventId }): AsyncResult<'GET', 'admin/audit/:eventId'> {
		await assertAdmin(this, req);

		if (!eventId) error(400, 'Missing event ID');

		const event = await db
			.selectFrom('audit_log')
			.selectAll()
			.select(eb =>
				jsonObjectFrom(eb.selectFrom('users').whereRef('users.id', '=', 'audit_log.userId').selectAll())
					.$castTo<UserInternal | null | undefined>()
					.as('user')
			)
			.where('id', '=', eventId)
			.executeTakeFirstOrThrow()
			.catch(withError('Audit event not found', 404));

		return event;
	},
});
