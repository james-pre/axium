import type { Preferences, UserInternal, VerificationRole } from '@axium/core';
import * as io from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
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
import config from './config.js';
import { dirs, systemDir } from './io.js';

import { connect, database } from './db/connection.js';
export { connect, database };

import * as schema from './db/schema.js';
export * as delta from './db/delta.js';
export * as schema from './db/schema.js';

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
export function userFromId<TB extends TablesMatching<{ userId: string }>>(
	builder: kysely.ExpressionBuilder<Schema, TB>
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

export async function getHBA(opt: OpOptions): Promise<[content: string, writeBack: (newContent: string) => void]> {
	const hbaShowResult = await io.run('Finding pg_hba.conf', `sudo -u postgres psql -c "SHOW hba_file"`);

	io.start('Resolving pg_hba.conf path');

	const hbaPath = hbaShowResult.match(/^\s*(.+\.conf)\s*$/m)?.[1]?.trim();

	if (!hbaPath) {
		throw 'failed. You will need to add password-based auth for the axium user manually.';
	}

	io.done();
	io.debug(`Found pg_hba.conf at ${hbaPath}`);

	io.start('Reading HBA configuration');
	const content = readFileSync(hbaPath, 'utf-8');
	io.done();

	const writeBack = (newContent: string): void => {
		io.start('Writing HBA configuration');
		writeFileSync(hbaPath, newContent);
		io.done();
	};

	return [content, writeBack];
}

/** @internal @hidden */
export const _pgHba = `
local axium axium md5
host  axium axium 127.0.0.1/32 md5
host  axium axium ::1/128 md5
`;

/** @internal @hidden */
export const _sql = (command: string, message: string) => io.run(message, `sudo -u postgres psql -c "${command}"`);
/** Shortcut to output a warning if an error is thrown because relation already exists */
export const warnExists = io.someWarnings([/\w+ "[\w.]+" already exists/, 'already exists.']);

export async function init(opt: InitOptions): Promise<void> {
	if (!config.db.password) {
		config.save({ db: { password: randomBytes(32).toString('base64') } }, true);
		io.debug('Generated password and wrote to global config');
	}

	await io.run('Checking for sudo', 'which sudo');
	await io.run('Checking for psql', 'which psql');

	await _sql('CREATE DATABASE axium', 'Creating database').catch(async (error: string) => {
		if (error != 'database "axium" already exists') throw error;
		if (shouldRecreate(opt)) return;

		await _sql('DROP DATABASE axium', 'Dropping database');
		await _sql('CREATE DATABASE axium', 'Re-creating database');
	});

	const createQuery = `CREATE USER axium WITH ENCRYPTED PASSWORD '${config.db.password}' LOGIN`;
	await _sql(createQuery, 'Creating user').catch(async (error: string) => {
		if (error != 'role "axium" already exists') throw error;
		if (shouldRecreate(opt)) return;

		await _sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
		await _sql('DROP USER axium', 'Dropping user');
		await _sql(createQuery, 'Re-creating user');
	});

	await _sql('GRANT ALL PRIVILEGES ON DATABASE axium TO axium', 'Granting database privileges');
	await _sql('GRANT ALL PRIVILEGES ON SCHEMA public TO axium', 'Granting schema privileges');
	await _sql('ALTER DATABASE axium OWNER TO axium', 'Setting database owner');

	await getHBA(opt)
		.then(([content, writeBack]) => {
			io.start('Checking for Axium HBA configuration');
			if (content.includes(_pgHba)) throw 'already exists.';
			io.done();

			io.start('Adding Axium HBA configuration');
			const newContent = content.replace(/^local\s+all\s+all.*$/m, `$&\n${_pgHba}`);
			io.done();

			writeBack(newContent);
		})
		.catch(io.warn);

	await _sql('SELECT pg_reload_conf()', 'Reloading configuration');

	io.start('Connecting to database');
	await using _ = connect();
	io.done();

	io.start('Creating schema acl');
	await database.schema.createSchema('acl').execute().then(io.done).catch(warnExists);
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

export const UpgradesInfo = z.object({
	current: VersionMap.default({}),
	upgrades: z.object({ timestamp: z.coerce.date(), from: VersionMap, to: VersionMap }).array().default([]),
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

/**
 * Checks that a table has the expected column types, nullability, and default values.
 */
export async function checkTableTypes<TB extends keyof Schema & string>(
	tableName: TB,
	types: schema.Table,
	opt: CheckOptions,
	tableMetadata?: kysely.TableMetadata[]
): Promise<void> {
	io.start(`Checking table ${tableName}`);
	tableMetadata ||= await database.introspection.getTables();
	const table = tableMetadata.find(t => (t.schema == 'public' ? t.name : `${t.schema}.${t.name}`) === tableName);
	if (!table) throw 'missing.';

	const columns = Object.fromEntries(table.columns.map(c => [c.name, c]));
	const _types = Object.entries(types.columns) as Entries<typeof types.columns>;

	for (const [i, [key, { type, required = false, default: _default }]] of _types.entries()) {
		io.progress(i, _types.length, key);
		const col = columns[key];
		const actualType = type in schema.toIntrospected ? schema.toIntrospected[type as keyof typeof schema.toIntrospected] : type;
		const hasDefault = _default !== undefined;
		try {
			if (!col) throw 'missing.';
			if (col.dataType != actualType) throw `incorrect type "${col.dataType}", expected ${actualType} (${type})`;
			if (col.isNullable != !required) throw required ? 'nullable' : 'not nullable';
			if (col.hasDefaultValue != hasDefault) throw hasDefault ? 'missing default' : 'has default';
		} catch (e: any) {
			if (opt.strict) throw `${tableName}.${key}: ${e}`;
			io.warn(`${tableName}.${key}: ${e}`);
		}
		delete columns[key];
	}

	if (!opt.extra) return;

	io.start('Checking for extra columns in ' + tableName);
	const unchecked = Object.keys(columns)
		.map(c => `${tableName}.${c}`)
		.join(', ');
	if (!unchecked.length) io.done();
	else if (opt.strict) throw unchecked;
	else io.warn(unchecked);
}

export async function clean(opt: Partial<OpOptions>): Promise<void> {
	const now = new Date();

	io.start('Removing expired sessions');
	await database.deleteFrom('sessions').where('sessions.expires', '<', now).execute().then(io.done);

	io.start('Removing expired verifications');
	await database.deleteFrom('verifications').where('verifications.expires', '<', now).execute().then(io.done);

	for (const plugin of plugins.values()) {
		if (!plugin._hooks?.clean) continue;
		io.log(styleText('whiteBright', 'Running plugin: '), plugin.name);
		await plugin._hooks?.clean(opt);
	}
}

export async function rotatePassword() {
	io.start('Generating new password');
	const password = randomBytes(32).toString('base64');
	io.done();

	io.start('Updating global config');
	config.save({ db: { password } }, true);
	io.done();

	await _sql(`ALTER USER axium WITH ENCRYPTED PASSWORD '${password}'`, 'Updating database user password');
}
