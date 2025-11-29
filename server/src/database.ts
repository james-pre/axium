import type { Permission, Preferences, Severity, UserInternal } from '@axium/core';
import * as io from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import type * as kysely from 'kysely';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import type { Entries } from 'utilium';
import type { VerificationRole } from './auth.js';
import config from './config.js';
import { styleText } from 'node:util';

export interface DBAccessControl {
	itemId: string;
	userId: string;
	createdAt: kysely.GeneratedAlways<Date>;
	permission: Permission;
}

export interface Schema {
	users: {
		id: string;
		email: string;
		name: string;
		image?: string | null;
		emailVerified?: Date | null;
		preferences: Preferences;
		isAdmin: boolean;
		roles: string[];
		tags: string[];
		registeredAt: kysely.GeneratedAlways<Date>;
		isSuspended: boolean;
	};
	sessions: {
		id: kysely.GeneratedAlways<string>;
		created: kysely.GeneratedAlways<Date>;
		userId: string;
		token: string;
		expires: Date;
		elevated: boolean;
	};
	verifications: {
		userId: string;
		token: string;
		expires: Date;
		role: VerificationRole;
	};
	passkeys: {
		id: string;
		name: string | null;
		createdAt: kysely.GeneratedAlways<Date>;
		userId: string;
		publicKey: Uint8Array<ArrayBuffer>;
		counter: number;
		deviceType: CredentialDeviceType;
		backedUp: boolean;
		transports: AuthenticatorTransportFuture[];
	};
	audit_log: {
		id: kysely.GeneratedAlways<string>;
		userId: string | null;
		timestamp: kysely.GeneratedAlways<Date>;
		severity: Severity;
		name: string;
		tags: kysely.Generated<string[]>;
		source: string;
		extra: kysely.Generated<Record<string, unknown>>;
	};
	[key: `acl.${string}`]: DBAccessControl;
}

export type Database = Kysely<Schema> & AsyncDisposable;

const sym = Symbol.for('Axium:database');

declare const globalThis: {
	[sym]?: Database;
};

export let database: Database;

export function connect(): Database {
	if (database) return database;
	if (globalThis[sym]) return (database = globalThis[sym]);

	database = new Kysely<Schema>({
		dialect: new PostgresDialect({ pool: new pg.Pool(config.db) }),
	});

	globalThis[sym] = database;
	io.debug('Connected to database!');
	return database;
}

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

const pgHba = `
local axium axium md5
host  axium axium 127.0.0.1/32 md5
host  axium axium ::1/128 md5
`;

const _sql = (command: string, message: string) => io.run(message, `sudo -u postgres psql -c "${command}"`);
/** Shortcut to output a warning if an error is thrown because relation already exists */
export const warnExists = io.someWarnings([/\w+ "[\w.]+" already exists/, 'already exists.']);
const throwUnlessRows = (text: string) => {
	if (text.includes('(0 rows)')) throw 'missing.';
	return text;
};

export async function createIndex(
	table: string,
	column: string,
	mod?: (ib: kysely.CreateIndexBuilder<string>) => kysely.CreateIndexBuilder<string>
): Promise<void> {
	io.start(`Creating index for ${table}.${column}`);
	let query = database.schema.createIndex(`${table}_${column}_index`).on(table).column(column);
	if (mod) query = mod(query);
	await query.execute().then(io.done).catch(warnExists);
}

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
			if (content.includes(pgHba)) throw 'already exists.';
			io.done();

			io.start('Adding Axium HBA configuration');
			const newContent = content.replace(/^local\s+all\s+all.*$/m, `$&\n${pgHba}`);
			io.done();

			writeBack(newContent);
		})
		.catch(io.warn);

	await _sql('SELECT pg_reload_conf()', 'Reloading configuration');

	io.start('Connecting to database');
	await using _ = connect();
	io.done();

	function maybeCheck(table: keyof ExpectedSchema) {
		return (e: Error | string) => {
			warnExists(e);
			if (opt.check) return checkTableTypes(table, expectedTypes[table], opt);
		};
	}

	io.start('Creating table users');
	await database.schema
		.createTable('users')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('name', 'text')
		.addColumn('email', 'text', col => col.unique().notNull())
		.addColumn('emailVerified', 'timestamptz')
		.addColumn('image', 'text')
		.addColumn('isAdmin', 'boolean', col => col.notNull().defaultTo(false))
		.addColumn('roles', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
		.addColumn('tags', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
		.addColumn('preferences', 'jsonb', col => col.notNull().defaultTo('{}'))
		.addColumn('registeredAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('isSuspended', 'boolean', col => col.notNull().defaultTo(false))
		.execute()
		.then(io.done)
		.catch(maybeCheck('users'));

	io.start('Creating table sessions');
	await database.schema
		.createTable('sessions')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('users.id').onDelete('cascade').notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.addColumn('elevated', 'boolean', col => col.notNull())
		.execute()
		.then(io.done)
		.catch(maybeCheck('sessions'));

	await createIndex('sessions', 'id');

	io.start('Creating table verifications');
	await database.schema
		.createTable('verifications')
		.addColumn('userId', 'uuid', col => col.references('users.id').onDelete('cascade').notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.addColumn('role', 'text', col => col.notNull())
		.execute()
		.then(io.done)
		.catch(maybeCheck('verifications'));

	io.start('Creating table passkeys');
	await database.schema
		.createTable('passkeys')
		.addColumn('id', 'text', col => col.primaryKey().notNull())
		.addColumn('name', 'text')
		.addColumn('createdAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').notNull())
		.addColumn('publicKey', 'bytea', col => col.notNull())
		.addColumn('counter', 'integer', col => col.notNull())
		.addColumn('deviceType', 'text', col => col.notNull())
		.addColumn('backedUp', 'boolean', col => col.notNull())
		.addColumn('transports', sql`text[]`)
		.execute()
		.then(io.done)
		.catch(maybeCheck('passkeys'));

	await createIndex('passkeys', 'userId');

	io.start('Creating table audit_log');
	await database.schema
		.createTable('audit_log')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('timestamp', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('userId', 'uuid')
		.addColumn('severity', 'integer', col => col.notNull())
		.addColumn('name', 'text', col => col.notNull())
		.addColumn('source', 'text', col => col.notNull())
		.addColumn('tags', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
		.addColumn('extra', 'jsonb', col => col.notNull().defaultTo('{}'))
		.execute()
		.then(io.done)
		.catch(maybeCheck('audit_log'));

	io.start('Creating schema acl');
	await database.schema.createSchema('acl').execute().then(io.done).catch(warnExists);

	for (const plugin of plugins.values()) {
		if (!plugin._hooks?.db_init) continue;
		io.log(styleText('whiteBright', 'Running plugin: '), plugin.name);
		await plugin._hooks?.db_init(opt);
	}
}

/**
 * Expected column types for a table in the database.
 */
export type ColumnTypes<TableSchema extends object> = {
	[K in keyof TableSchema & string]: { type: string; required?: boolean; hasDefault?: boolean };
};

type _Expected = {
	[K in keyof Schema & string]: ColumnTypes<Schema[K]>;
};

export interface ExpectedSchema extends _Expected {}

export const expectedTypes: ExpectedSchema = {
	users: {
		email: { type: 'text', required: true },
		emailVerified: { type: 'timestamptz' },
		id: { type: 'uuid', required: true, hasDefault: true },
		image: { type: 'text' },
		isAdmin: { type: 'bool', required: true, hasDefault: true },
		name: { type: 'text' },
		preferences: { type: 'jsonb', required: true, hasDefault: true },
		registeredAt: { type: 'timestamptz', required: true, hasDefault: true },
		roles: { type: '_text', required: true, hasDefault: true },
		tags: { type: '_text', required: true, hasDefault: true },
		isSuspended: { type: 'bool', required: true, hasDefault: true },
	},
	verifications: {
		userId: { type: 'uuid', required: true },
		token: { type: 'text', required: true },
		expires: { type: 'timestamptz', required: true },
		role: { type: 'text', required: true },
	},
	passkeys: {
		id: { type: 'text', required: true },
		name: { type: 'text' },
		createdAt: { type: 'timestamptz', required: true, hasDefault: true },
		userId: { type: 'uuid', required: true },
		publicKey: { type: 'bytea', required: true },
		counter: { type: 'int4', required: true },
		deviceType: { type: 'text', required: true },
		backedUp: { type: 'bool', required: true },
		transports: { type: '_text' },
	},
	sessions: {
		id: { type: 'uuid', required: true, hasDefault: true },
		userId: { type: 'uuid', required: true },
		created: { type: 'timestamptz', required: true, hasDefault: true },
		token: { type: 'text', required: true },
		expires: { type: 'timestamptz', required: true },
		elevated: { type: 'bool', required: true },
	},
	audit_log: {
		userId: { type: 'uuid' },
		timestamp: { type: 'timestamptz', required: true, hasDefault: true },
		id: { type: 'uuid', required: true, hasDefault: true },
		severity: { type: 'int4', required: true },
		name: { type: 'text', required: true },
		source: { type: 'text', required: true },
		tags: { type: '_text', required: true, hasDefault: true },
		extra: { type: 'jsonb', required: true, hasDefault: true },
	},
};

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
	types: ColumnTypes<Schema[TB]>,
	opt: CheckOptions
): Promise<void> {
	io.start(`Checking for table ${tableName}`);
	const dbTables = opt._metadata || (await database.introspection.getTables());
	const table = dbTables.find(t => (t.schema == 'public' ? t.name : `${t.schema}.${t.name}`) === tableName);
	if (!table) throw 'missing.';
	io.done();

	const columns = Object.fromEntries(table.columns.map(c => [c.name, c]));

	for (const [key, { type, required = false, hasDefault = false }] of Object.entries(types) as Entries<typeof types>) {
		io.start(`Checking column ${tableName}.${key}`);
		const col = columns[key];
		if (!col) throw 'missing.';
		try {
			if (col.dataType != type) throw `incorrect type "${col.dataType}", expected ${type}`;
			if (col.isNullable != !required) throw required ? 'nullable' : 'not nullable';
			if (col.hasDefaultValue != hasDefault) throw hasDefault ? 'missing default' : 'has default';
			io.done();
		} catch (e: any) {
			if (opt.strict) throw e;
			io.warn(e);
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

export async function check(opt: CheckOptions): Promise<void> {
	await io.run('Checking for sudo', 'which sudo');
	await io.run('Checking for psql', 'which psql');

	await _sql(`SELECT 1 FROM pg_database WHERE datname = 'axium'`, 'Checking for database').then(throwUnlessRows);

	await _sql(`SELECT 1 FROM pg_roles WHERE rolname = 'axium'`, 'Checking for user').then(throwUnlessRows);

	io.start('Connecting to database');
	await using _ = connect();
	io.done();

	io.start('Getting table metadata');
	opt._metadata = await database.introspection.getTables();
	const tables = Object.fromEntries(opt._metadata.map(t => [t.name, t]));
	io.done();

	for (const table of Object.keys(expectedTypes) as (keyof typeof expectedTypes)[]) {
		await checkTableTypes(table, expectedTypes[table], opt);
		delete tables[table];
	}

	io.start('Checking for extra tables');
	const unchecked = Object.keys(tables).join(', ');
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

/**
 * Completely remove Axium from the database.
 */
export async function uninstall(opt: OpOptions): Promise<void> {
	for (const plugin of plugins.values()) {
		if (!plugin._hooks?.remove) continue;
		io.log(styleText('whiteBright', 'Running plugin: '), plugin.name);
		await plugin._hooks?.remove(opt);
	}

	await _sql('DROP DATABASE axium', 'Dropping database');
	await _sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
	await _sql('DROP USER axium', 'Dropping user');

	await getHBA(opt)
		.then(([content, writeBack]) => {
			io.start('Checking for Axium HBA configuration');
			if (!content.includes(pgHba)) throw 'missing.';
			io.done();

			io.start('Removing Axium HBA configuration');
			const newContent = content.replace(pgHba, '');
			io.done();

			writeBack(newContent);
		})
		.catch(io.warn);
}

/**
 * Removes all data from tables.
 */
export async function wipe(opt: OpOptions): Promise<void> {
	for (const plugin of plugins.values()) {
		if (!plugin._hooks?.db_wipe) continue;
		io.log(styleText('whiteBright', 'Running plugin: '), plugin.name);
		await plugin._hooks?.db_wipe(opt);
	}

	for (const table of ['users', 'passkeys', 'sessions', 'verifications'] as const) {
		io.start(`Wiping ${table}`);
		await database.deleteFrom(table).execute();
		io.done();
	}

	for (const table of await database.introspection.getTables()) {
		if (!table.name.startsWith('acl.')) continue;
		const name = table.name as `acl.${string}`;
		io.debug(`Wiping ${name}`);
		await database.deleteFrom(name).execute();
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
