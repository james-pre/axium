import type { AsyncResult, PluginInternal, UserInternal } from '@axium/core';
import { AuditFilter, Severity, UserAdminChange } from '@axium/core';
import { debug, errorText, writeJSON } from '@axium/core/node/io';
import { getVersionInfo } from '@axium/core/node/packages';
import { _findPlugin, plugins, PluginUpdate, serverConfigs } from '@axium/core/plugins';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path/posix';
import { deepAssign, omit, type Add, type Tuple } from 'utilium';
import * as z from 'zod';
import { audit, events, getEvents } from '../audit.js';
import { createVerification, requireSession, type SessionAndUser } from '../auth.js';
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

		const results = await db
			.selectFrom('audit_log')
			.select(({ fn }) => ['severity', fn.countAll<number>().as('count')])
			.groupBy('severity')
			.execute();

		const auditEvents = Array(Severity.Debug + 1).fill(0) as Tuple<number, Add<Severity.Debug, 1>>;

		for (const { severity, count } of results) auditEvents[severity] = count;

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
	async POST(req): AsyncResult<'POST', 'admin/plugins'> {
		await assertAdmin(this, req);

		const { plugin: name, config } = await parseBody(req, PluginUpdate);

		let plugin: PluginInternal;
		try {
			plugin = _findPlugin(name);
		} catch {
			error(404, 'Plugin not found');
		}

		if (config) {
			const { schema } = serverConfigs.get(name) || {};
			if (!schema) error(400, 'Plugin does not have a configuration schema');
			if (!plugin._configPath) error(503, 'Plugin configuration path is not set');

			plugin.config ||= {};

			debug('Updating plugin config:', name);
			const parsed = await schema.parseAsync(config).catch(e => error(400, errorText(e)));
			deepAssign(plugin.config, parsed);
			mkdirSync(dirname(plugin._configPath), { recursive: true });
			writeJSON(plugin._configPath, plugin.config);
		}

		return {};
	},
});

addRoute({
	path: '/api/admin/users',
	async GET(req): AsyncResult<'GET', 'admin/users'> {
		await assertAdmin(this, req);

		const users: UserInternal[] = await db.selectFrom('users').selectAll().execute();

		return users;
	},
	async PATCH(req): AsyncResult<'PATCH', 'admin/users'> {
		await assertAdmin(this, req);

		const userChange = await parseBody(req, UserAdminChange);

		const userId = userChange.id;
		delete (userChange as { id?: string }).id;

		return await db.updateTable('users').set(userChange).where('id', '=', userId).returningAll().executeTakeFirstOrThrow();
	},
	async PUT(req): AsyncResult<'PUT', 'admin/users'> {
		await assertAdmin(this, req);

		const { name, email } = await parseBody(req, z.object({ name: z.string(), email: z.email() }));

		const tx = await db.startTransaction().execute();

		try {
			const user = await tx.insertInto('users').values({ name, email: email.toLowerCase() }).returningAll().executeTakeFirstOrThrow();

			const verification = await createVerification.call(tx, 'login', user.id, config.verifications.timeout);

			await tx.commit().execute();

			return { user, verification };
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
