import client from '@axium/client/package.json' with { type: 'json' };
import type { AsyncResult, PluginInternal, UserInternal } from '@axium/core';
import { AuditFilter, Severity, UserAdminChange, UserRegistrationInit } from '@axium/core';
import core from '@axium/core/package.json' with { type: 'json' };
import { _findPlugin, plugins, PluginUpdate, serverConfigs } from '@axium/core/plugins';
import { debug, errorText, warn, writeJSON } from 'ioium/node';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path/posix';
import { deepAssign, getByString, omit, setByString, type Add, type Tuple } from 'utilium';
import * as z from 'zod';
import $pkg from '../../package.json' with { type: 'json' };
import { audit, events, getEvents } from '../audit.js';
import { createVerification, requireSession, type SessionAndUser } from '../auth.js';
import { config, configManager } from '../config.js';
import { count, database as db } from '../db/index.js';
import { error, parseBody, parseSearch, withError } from '../requests.js';
import { addRoute, type RouteCommon } from '../routes.js';
import * as secrets from '../secrets.js';

export async function assertAdmin(route: RouteCommon, req: Request, sensitive: boolean = false): Promise<SessionAndUser> {
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
			configFiles: configManager.filePaths.toArray().length,
			plugins: plugins.size,
			versions: {
				server: $pkg.version,
				core: core.version,
				client: client.version,
			},
		};
	},
});

addRoute({
	path: '/api/admin/plugins',
	async GET(req): AsyncResult<'GET', 'admin/plugins'> {
		await assertAdmin(this, req);
		return plugins
			.values()
			.map(plugin => {
				const info = omit(plugin, '_hooks', '_client');
				const schema = serverConfigs.get(plugin.name);
				if (!schema || !plugin.config) return info;
				const config = structuredClone(plugin.config);
				secrets.strip(schema, config);
				return { ...info, config };
			})
			.toArray();
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
			const schema = serverConfigs.get(name) || null;
			if (!schema) error(400, 'Plugin does not have a configuration schema');
			if (!plugin._configPath) error(503, 'Plugin configuration path is not set');

			plugin.config ||= {};

			debug('Updating plugin config:', name);

			const changed = secrets.strip(schema, config);
			for (const path of changed.keys()) {
				const id = secrets.idFor(path, name);
				if (!secrets.info(id).editable) error(409, `The secret ${id} can not be changed here`);
			}

			for (const path of secrets.paths(schema)) {
				const value = changed.get(path) ?? getByString(plugin.config, path);
				if (value !== undefined) setByString(config, path, value);
			}

			const parsed = await schema.parseAsync(config).catch(e => error(400, errorText(e)));

			for (const [path, value] of changed) {
				const id = secrets.idFor(path, name);
				if (secrets.get(id)?.value !== value) secrets.set(id, value, 'file');
			}
			plugin.secrets = secrets.describe(schema, name);

			deepAssign(plugin.config, parsed, { replaceArrays: true });
			const file = structuredClone(plugin.config);
			secrets.strip(schema, file);
			mkdirSync(dirname(plugin._configPath), { recursive: true });
			writeJSON(plugin._configPath, file);

			await Promise.resolve(plugin._hooks?.configChanged?.()).catch(e =>
				warn(`Failed to apply new config for plugin ${name}: ${errorText(e)}`)
			);
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

		const { name, username } = await parseBody(req, UserRegistrationInit);

		const tx = await db.startTransaction().execute();

		try {
			const user = await tx.insertInto('users').values({ name, username }).returningAll().executeTakeFirstOrThrow();

			const verification = await createVerification.call(tx, 'login', user.id, config.verifications.timeout);

			await tx.commit().execute();

			return { user, verification };
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
});

addRoute({
	path: '/api/admin/config',
	async GET(req): AsyncResult<'GET', 'admin/config'> {
		await assertAdmin(this, req);

		const active = structuredClone(configManager.data);
		secrets.strip(configManager.schema, active);

		return {
			config: active,
			files: Object.fromEntries(
				configManager.files.map(file => {
					secrets.strip(configManager.schema, file.data);
					return [file.path, file.data];
				})
			),
			secrets: secrets.describe(configManager.schema),
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
				jsonObjectFrom(
					eb
						.selectFrom('users')
						.whereRef('users.id', '=', 'audit_log.userId')
						.select(['id', 'name', 'username', 'registeredAt', 'roles'])
				).as('user')
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
