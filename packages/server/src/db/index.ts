import type { Preferences, UserInternal, VerificationRole } from '@axium/core';
import { plugins } from '@axium/core/plugins';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import * as io from 'ioium/node';
import type * as kysely from 'kysely';
import { sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { styleText } from 'node:util';
import pg from 'pg';
import type { Entries, Expand } from 'utilium';
import * as z from 'zod';
import { config, saveConfig } from '../config.js';
import { dirs, systemDir } from '../io.js';

import { connect, database } from './connection.js';

import * as delta from './delta.js';
import * as schema from './schema.js';

export { connect, database, delta, schema };

pg.types.setTypeParser(pg.types.builtins.INT8, BigInt);

// @ts-expect-error 2339
BigInt.prototype.toJSON = function (this: bigint) {
	return Number(this);
};

export interface DBAccessControl {
	itemId: string;
	userId?: string | null;
	role?: string | null;
	tag?: string | null;
	createdAt: kysely.Generated<Date>;
}

export type DBBool<K extends string> = { [key in K]?: boolean | null };

// Helpers

export async function count<const TB extends keyof Schema>(...tables: TB[]): Promise<{ [K in TB]: number }> {
	return await database
		.selectNoFrom(eb =>
			tables.map(t =>
				eb
					.selectFrom(t as any)
					.select(database.fn.countAll<number>() as any)
					.as(t)
			)
		)
		.$castTo<Record<TB, number>>()
		.executeTakeFirstOrThrow();
}

export type TablesMatching<T> = (string & keyof Schema) & keyof { [K in keyof Schema as Schema[K] extends T ? K : never]: null };

/**
 * Select the user with the id from the userId column of a table, placing it in the `user` property.
 */
export function userFromId<TB extends TablesMatching<{ userId: string }>, const DB extends Schema = Schema>(
	builder: kysely.ExpressionBuilder<DB, TB>
): kysely.AliasedRawBuilder<UserInternal, 'user' | TB> {
	const eb = builder as kysely.ExpressionBuilder<Schema, TablesMatching<{ userId: string }>>;
	return jsonObjectFrom(eb.selectFrom('users').selectAll().whereRef('id', '=', 'userId'))
		.$notNull()
		.$castTo<UserInternal>()
		.as('user');
}

/**
 * Used for `update ... set ... from`
 */
export function values<R extends Record<string, unknown>, A extends string>(records: R[], alias: A) {
	if (!records?.length) throw new Error('Can not create values() with empty records array');
	// Assume there's at least one record and all records
	// have the same keys.
	const keys = Object.keys(records[0]);

	// Transform the records into a list of lists such as
	// ($1, $2, $3), ($4, $5, $6)
	const values = sql.join(records.map(r => sql`(${sql.join(keys.map(k => r[k]))})`));

	// Create the alias `v(id, v1, v2)` that specifies the table alias
	// AND a name for each column.
	const wrappedAlias = sql.ref(alias);
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const wrappedColumns = sql.join(keys.map(sql.ref));
	const aliasSql = sql`${wrappedAlias}(${wrappedColumns})`;

	// Finally create a single `AliasedRawBuilder` instance of the
	// whole thing. Note that we need to explicitly specify
	// the alias type using `.as<A>` because we are using a
	// raw sql snippet as the alias.
	return sql<R>`(values ${values})`.as<A>(aliasSql);
}

// Stuff for the CLI

export interface Stats {
	users: number;
	passkeys: number;
	sessions: number;
}

export async function statText(): Promise<string> {
	try {
		const stats = await count('users', 'passkeys', 'sessions');
		return `${stats.users} users, ${stats.passkeys} passkeys, ${stats.sessions} sessions`;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

export interface OpOptions {
	force?: boolean;
}

export interface InitOptions extends OpOptions {
	skip: boolean;
	check: boolean;
}

export function shouldRecreate(opt: InitOptions): boolean {
	if (opt.skip) {
		io.warn('already exists. (skipped)');
		return true;
	}

	if (opt.force) {
		io.warn('already exists. (re-creating)');
		return false;
	}

	io.warn('already exists. Use --skip to skip or --force to re-create.');
	throw 2;
}

export function findHBA(): string {
	const hbaShowResult = io.trackCommand('Finding pg_hba.conf', 'sudo', '-u', 'postgres', 'psql', '-c', 'SHOW hba_file');

	const hbaPath = io.track('Resolving pg_hba.conf path', () => {
		const result = hbaShowResult.match(/^\s*(.+\.conf)\s*$/m)?.[1]?.trim();
		if (!result) throw 'failed. You will need to add password-based auth for the axium user manually.';
		return result;
	});

	io.debug(`Found pg_hba.conf at ${hbaPath}`);

	return hbaPath;
}

export function getHBA(): string {
	return io.track('Reading HBA configuration', () => readFileSync(findHBA(), 'utf-8'));
}

export function updateHBA(transform: (content: string) => string) {
	let path: string, newContent: string;

	try {
		path = findHBA();
		const content = io.track('Reading HBA configuration', () => readFileSync(path, 'utf-8'));
		newContent = transform(content);
	} catch (e) {
		io.warn(e);
		return;
	}

	io.track('Writing HBA configuration', () => writeFileSync(path, newContent));
}

/** @internal @hidden */
export const _pgHba = `
local axium axium md5
host  axium axium 127.0.0.1/32 md5
host  axium axium ::1/128 md5
`;

/** @internal @hidden */
export const _sql = (command: string, message: string) => io.trackCommand(message, 'sudo', '-u', 'postgres', 'psql', '-c', command);
/** Shortcut to output a warning if an error is thrown because relation already exists */
export const warnExists = io.someWarnings([/\w+ "[\w.]+" already exists/, 'already exists.']);

export async function init(opt: InitOptions): Promise<void> {
	if (!config.db.password) {
		saveConfig({ db: { password: randomBytes(32).toString('base64') } }, true);
		io.debug('Generated password and wrote to global config');
	}

	io.trackCommand('Checking for sudo', 'which', 'sudo');
	io.trackCommand('Checking for psql', 'which', 'psql');

	try {
		_sql('CREATE DATABASE axium', 'Creating database');
	} catch (error) {
		if (error != 'database "axium" already exists') throw error;
		if (!shouldRecreate(opt)) {
			_sql('DROP DATABASE axium', 'Dropping database');
			_sql('CREATE DATABASE axium', 'Re-creating database');
		}
	}

	const createQuery = `CREATE USER axium WITH ENCRYPTED PASSWORD '${config.db.password}' LOGIN`;
	try {
		_sql(createQuery, 'Creating user');
	} catch (error: any) {
		if (error != 'role "axium" already exists') throw error;
		if (!shouldRecreate(opt)) {
			_sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
			_sql('DROP USER axium', 'Dropping user');
			_sql(createQuery, 'Re-creating user');
		}
	}

	_sql('GRANT ALL PRIVILEGES ON DATABASE axium TO axium', 'Granting database privileges');
	_sql('GRANT ALL PRIVILEGES ON SCHEMA public TO axium', 'Granting schema privileges');
	_sql('ALTER DATABASE axium OWNER TO axium', 'Setting database owner');

	updateHBA(content => {
		io.track('Checking for Axium HBA configuration', () => {
			if (content.includes(_pgHba)) throw 'already exists.';
		});

		return io.track('Adding Axium HBA configuration', () => content.replace(/^local\s+all\s+all.*$/m, `$&\n${_pgHba}`));
	});

	_sql('SELECT pg_reload_conf()', 'Reloading configuration');

	io.track('Connecting to database', connect);

	await io.track('Creating schema acl', database.schema.createSchema('acl').execute()).catch(warnExists);
}

export interface Schema extends Omit<schema.Raw, 'users' | 'verifications' | 'passkeys'> {
	users: Expand<
		schema.Raw['users'] & {
			preferences: kysely.Generated<Preferences>;
		}
	>;

	verifications: Expand<
		schema.Raw['verifications'] & {
			role: VerificationRole;
		}
	>;

	passkeys: Expand<
		Omit<schema.Raw['passkeys'], 'transports'> & {
			deviceType: CredentialDeviceType;
			transports: AuthenticatorTransportFuture[];
		}
	>;
	[key: `acl.${string}`]: DBAccessControl & Record<string, unknown>;
}

const VersionMap = z.record(z.string(), z.int32().nonnegative());

export const UpgradesInfoEntry = z.object({ timestamp: z.coerce.date(), from: VersionMap, to: VersionMap });

export interface UpgradesInfoEntry extends z.infer<typeof UpgradesInfoEntry> {}

export const UpgradesInfo = z.object({
	current: VersionMap.default({}),
	upgrades: UpgradesInfoEntry.array().default([]),
});

export interface UpgradesInfo extends z.infer<typeof UpgradesInfo> {}

const upgradesFilePath = process.getuid?.() == 0 ? join(systemDir, 'db_upgrades.json') : join(dirs.at(-1)!, 'db_upgrades.json');

export function getUpgradeInfo(): UpgradesInfo {
	if (!existsSync(upgradesFilePath)) io.writeJSON(upgradesFilePath, { current: {}, upgrades: [] });
	return io.readJSON(upgradesFilePath, UpgradesInfo);
}

export function setUpgradeInfo(info: UpgradesInfo): void {
	io.writeJSON(upgradesFilePath, info);
}

export interface Upgrade {
	delta: delta.Version;
	info: UpgradesInfo;
}

export function initUpgrade(filter?: string[]): Upgrade | null {
	const deltas: delta.Version[] = [];

	const info = getUpgradeInfo();

	let empty = true;

	const from: Record<string, number> = {},
		to: Record<string, number> = {};

	for (const [name, vSchema] of schema.getFiles()) {
		if (filter?.length && !filter.includes(name)) continue;
		if (!(name in info.current)) throw 'Plugin is not initialized: ' + name;

		const currentVersion = info.current[name];
		const target = vSchema.latest ?? vSchema.versions.length - 1;

		if (currentVersion >= target) continue;

		from[name] = currentVersion;
		to[name] = target;

		info.current[name] = target;

		let versions = vSchema.versions.slice(currentVersion + 1);

		const v0 = vSchema.versions[0];
		if (v0.delta) throw 'Initial version can not be a delta';

		for (const [i, v] of versions.toReversed().entries()) {
			if (v.delta || v == v0) continue;
			versions = [delta.compute(v0, v), ...versions.slice(-i)];
			break;
		}

		const vDelta = delta.collapse(versions as delta.Version[]);

		deltas.push(vDelta);

		console.log(
			'Upgrading',
			name,
			styleText('dim', currentVersion.toString() + '->') + styleText('blueBright', target.toString()) + ':'
		);
		if (!delta.isEmpty(vDelta)) empty = false;
		for (const text of delta.display(vDelta)) console.log(text);
	}

	info.upgrades.push({ timestamp: new Date(), from, to });

	return empty ? null : { delta: delta.collapse(deltas), info };
}

export interface CheckOptions extends OpOptions {
	/** Whether to throw an error instead of emitting a warning on most column issues */
	strict?: boolean;

	/**
	 * Memoized introspection table metadata.
	 * @internal @hidden
	 */
	_metadata?: kysely.TableMetadata[];

	/**
	 * Whether to check for extra columns.
	 */
	extra?: boolean;
}

const toIntrospected: Record<string, [string, hasDefault?: boolean]> = {
	boolean: ['bool'],
	integer: ['int4'],
	serial: ['int4', true],
	bigint: ['int8'],
	bigserial: ['int8', true],
};

/**
 * Checks that a table has the expected column types, nullability, and default values.
 */
export async function checkTableTypes<TB extends keyof Schema & string>(
	tableName: TB,
	types: schema.Table,
	opt: CheckOptions,
	tableMetadata?: kysely.TableMetadata[]
): Promise<void> {
	using _ = io.start(`Checking table ${tableName}`);
	tableMetadata ||= await database.introspection.getTables();
	const table = tableMetadata.find(t => (t.schema == 'public' ? t.name : `${t.schema}.${t.name}`) === tableName);
	if (!table) throw 'missing.';

	const columns = Object.fromEntries(table.columns.map(c => [c.name, c]));
	const _types = Object.entries(types.columns) as Entries<typeof types.columns>;

	for (const [i, [key, { type: rawType, required = false, default: _default }]] of _types.entries()) {
		const col = columns[key];
		let type: string = rawType;
		if (type.endsWith('[]')) type = '_' + type.slice(0, -2);
		let hasDefault = _default !== undefined;
		if (type in toIntrospected) {
			const [newType, _hasDefault] = toIntrospected[type];
			type = newType;
			if (typeof _hasDefault === 'boolean') hasDefault = _hasDefault;
		}
		try {
			if (!col) throw 'missing.';
			if (col.dataType != type) throw `incorrect type "${col.dataType}", expected ${type} (${rawType})`;
			if (col.isNullable != !required) throw required ? 'nullable' : 'not nullable';
			if (col.hasDefaultValue != hasDefault) throw hasDefault ? 'missing default' : 'has default';
		} catch (e: any) {
			if (opt.strict) throw `${tableName}.${key}: ${e}`;
			io.warn(`${tableName}.${key}: ${e}`);
		}
		delete columns[key];
		io.progress(i + 1, _types.length, key);
	}

	if (!opt.extra) return;

	using _2 = io.start('Checking for extra columns in ' + tableName);
	const unchecked = Object.keys(columns)
		.map(c => `${tableName}.${c}`)
		.join(', ');
	if (!unchecked.length) io.done();
	else if (opt.strict) throw unchecked;
	else io.warn(unchecked);
}

export async function clean(opt: Partial<OpOptions>): Promise<void> {
	const db = connect();

	const now = new Date();

	await io.track('Removing expired sessions', db.deleteFrom('sessions').where('sessions.expires', '<', now).execute());

	await io.track('Removing expired verifications', db.deleteFrom('verifications').where('verifications.expires', '<', now).execute());

	for (const plugin of plugins.values()) {
		if (!plugin._hooks?.clean) continue;
		io.log(styleText('whiteBright', 'Running plugin: '), plugin.name);
		await plugin._hooks?.clean(opt);
	}
}

export function rotatePassword() {
	const password = io.track('Generating new password', () => randomBytes(32).toString('base64'));

	io.track('Updating global config', () => saveConfig({ db: { password } }, true));

	_sql(`ALTER USER axium WITH ENCRYPTED PASSWORD '${password}'`, 'Updating database user password');
}
