import type { AsyncResult, UserInternal } from '@axium/core';
import { AuditFilter, Severity } from '@axium/core';
import { getVersionInfo } from '@axium/core/packages';
import { plugins } from '@axium/core/plugins';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { omit } from 'utilium';
import * as z from 'zod';
import { audit, events, getEvents } from '../audit.js';
import { createVerification, requireSession, type SessionAndUser, type SessionInternal } from '../auth.js';
import { config, type Config } from '../config.js';
import { count, database as db } from '../database.js';
import { error, parseBody, parseSearch, withError } from '../requests.js';
import { addRoute, type RouteCommon } from '../routes.js';

async function assertAdmin(route: RouteCommon, req: Request, sensitive: boolean = false): Promise<SessionAndUser> {
	const admin = await requireSession(req, sensitive);

	if (!admin.user.isAdmin) error(403, 'Not an administrator');

	if (!config.admin_api) error(503, 'Admin API is disabled');

	await audit('admin_api', admin.userId, { route: route.path, session: admin.id });

	return admin;
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
			versions: {
				server: await getVersionInfo('@axium/server'),
				core: await getVersionInfo('@axium/core'),
				client: await getVersionInfo('@axium/client'),
			},
		};
	},
});

addRoute({
	path: '/api/admin/plugins',
	async GET(req): AsyncResult<'GET', 'admin/plugins'> {
		await assertAdmin(this, req);

		return await Array.fromAsync(
			plugins
				.values()
				.map(async p =>
					Object.assign(
						omit(p, '_hooks', '_client'),
						p.update_checks ? await getVersionInfo(p.specifier, p.loadedBy) : { latest: null }
					)
				)
		);
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
	async DELETE(req, { userId }): AsyncResult<'DELETE', 'admin/users/:userId'> {
		const { id: admin_session } = await assertAdmin(this, req, true);

		if (!userId) error(400, 'Missing user ID');

		await audit('user_deleted', userId, { admin_session });

		return await db
			.deleteFrom('users')
			.where('id', '=', userId)
			.limit(1) // just in case userId is still somehow not set
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('User not found', 404));
	},
});

addRoute({
	path: '/api/admin/users',
	async PUT(req): AsyncResult<'PUT', 'admin/users'> {
		await assertAdmin(this, req);

		const { name, email } = await parseBody(req, z.object({ name: z.string(), email: z.email() }));

		const tx = await db.startTransaction().execute();

		try {
			const user = await tx.insertInto('users').values({ name, email: email.toLowerCase() }).returningAll().executeTakeFirstOrThrow();

			const verification = await createVerification.call(tx, 'login', user.id, config.verifications.timeout);

			await tx.commit().execute();

			return verification;
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
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
		Object.assign(filter, parseSearch(req, AuditFilter));

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
