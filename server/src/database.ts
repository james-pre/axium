import type { Permission, Preferences, Severity, UserInternal } from '@axium/core';
import * as io from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import type * as kysely from 'kysely';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import { styleText } from 'node:util';
import pg from 'pg';
import type { Entries } from 'utilium';
import * as z from 'zod';
import type { VerificationRole } from './auth.js';
import config from './config.js';
import rawSchema from './db.json' with { type: 'json' };
import { dirs, systemDir } from './io.js';

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

export const Column = z.strictObject({
	type: z.string(),
	required: z.boolean().default(false),
	unique: z.boolean().default(false),
	primary: z.boolean().default(false),
	references: z.string().optional(),
	onDelete: z.enum(['cascade', 'restrict', 'no action', 'set null', 'set default']).optional(),
	default: z.any().optional(),
	check: z.string().optional(),
});

export interface Column extends z.infer<typeof Column> {}

export const Table = z.record(z.string(), Column);

export interface Table extends z.infer<typeof Table> {}

export const IndexString = z.templateLiteral([z.string(), ':', z.string()]);

export type IndexString = z.infer<typeof IndexString>;

export function parseIndex(value: IndexString): { table: string; column: string } {
	const [table, column] = value.split(':');
	return { table, column };
}

export const SchemaDecl = z.strictObject({
	tables: z.record(z.string(), Table),
	indexes: IndexString.array().optional().default([]),
});

export interface SchemaDecl extends z.infer<typeof SchemaDecl> {}

export const TableDelta = z.strictObject({
	add_columns: z.record(z.string(), Column).optional().default({}),
	drop_columns: z.string().array().optional().default([]),
});

export interface TableDelta extends z.infer<typeof TableDelta> {}

export const VersionDelta = z.strictObject({
	delta: z.literal(true),
	add_tables: z.record(z.string(), Table).optional().default({}),
	drop_tables: z.string().array().optional().default([]),
	modify_tables: z.record(z.string(), TableDelta).optional().default({}),
	add_indexes: IndexString.array().optional().default([]),
	drop_indexes: IndexString.array().optional().default([]),
});

export interface VersionDelta extends z.infer<typeof VersionDelta> {}

export const SchemaFile = z.object({
	format: z.literal(0),
	versions: z.discriminatedUnion('delta', [SchemaDecl.extend({ delta: z.literal(false) }), VersionDelta]).array(),
	/** List of tables to wipe */
	wipe: z.string().array().optional().default([]),
	/** Set the latest version, defaults to the last one */
	latest: z.number().nonnegative().optional(),
});

export interface SchemaFile extends z.infer<typeof SchemaFile> {}

const schema = SchemaFile.parse(rawSchema);

export function* getSchemaFiles(): Generator<[string, SchemaFile]> {
	yield ['@axium/server', schema];

	for (const [name, plugin] of plugins) {
		if (!plugin._db) continue;
		try {
			yield [name, SchemaFile.parse(plugin._db)];
		} catch (e) {
			const text = e instanceof z.core.$ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : String(e);
			throw `Invalid database configuration for plugin "${name}":\n${text}`;
		}
	}
}

/**
 * Get the active schema
 */
export function getFullSchema(opt: { exclude?: string[] } = {}): SchemaDecl {
	const fullSchema: SchemaDecl = { tables: {}, indexes: [] };

	for (const [pluginName, file] of getSchemaFiles()) {
		if (opt.exclude?.includes(pluginName)) continue;

		let currentSchema: SchemaDecl = { tables: {}, indexes: [] };

		for (const [version, schema] of file.versions.entries()) {
			if (schema.delta) applyDeltaToSchema(currentSchema, schema);
			else currentSchema = schema;

			if (version === file.latest) break;
		}

		for (const name of Object.keys(currentSchema.tables)) {
			if (name in fullSchema.tables) throw 'Duplicate table name in database schema: ' + name;
			fullSchema.tables[name] = currentSchema.tables[name];
		}

		for (const index of currentSchema.indexes) {
			if (fullSchema.indexes.includes(index)) throw 'Duplicate index in database schema: ' + index;
			fullSchema.indexes.push(index);
		}
	}

	return fullSchema;
}

const schemaToIntrospected = {
	boolean: 'bool',
	integer: 'int4',
	'text[]': '_text',
};

const VersionMap = z.record(z.string(), z.int().nonnegative());

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

export function applyTableDeltaToSchema(table: Table, delta: TableDelta): void {
	for (const column of delta.drop_columns) {
		if (column in table) delete table[column];
		else throw `Can't drop column ${column} because it does not exist`;
	}

	for (const [name, column] of Object.entries(delta.add_columns)) {
		if (name in table) throw `Can't add column ${name} because it already exists`;
		table[name] = column;
	}
}

export function applyDeltaToSchema(schema: SchemaDecl, delta: VersionDelta): void {
	for (const tableName of delta.drop_tables) {
		if (tableName in schema.tables) delete schema.tables[tableName];
		else throw `Can't drop table ${tableName} because it does not exist`;
	}

	for (const [tableName, table] of Object.entries(delta.add_tables)) {
		if (tableName in schema.tables) throw `Can't add table ${tableName} because it already exists`;
		else schema.tables[tableName] = table;
	}

	for (const [tableName, tableDelta] of Object.entries(delta.modify_tables)) {
		if (tableName in schema.tables) applyTableDeltaToSchema(schema.tables[tableName], tableDelta);
		else throw `Can't modify table ${tableName} because it does not exist`;
	}
}

export function validateDelta(delta: VersionDelta): void {
	const tableNames = [...Object.keys(delta.add_tables), ...Object.keys(delta.modify_tables), delta.drop_tables];
	const uniqueTables = new Set(tableNames);
	for (const table of uniqueTables) {
		tableNames.splice(tableNames.indexOf(table), 1);
	}

	if (tableNames.length) {
		throw `Duplicate table name(s): ${tableNames.join(', ')}`;
	}

	for (const [tableName, table] of Object.entries(delta.modify_tables)) {
		const columnNames = [...Object.keys(table.add_columns), ...table.drop_columns];
		const uniqueColumns = new Set(columnNames);

		for (const column of uniqueColumns) {
			columnNames.splice(columnNames.indexOf(column), 1);
		}

		if (columnNames.length) {
			throw `Duplicate column name(s) in table ${tableName}: ${columnNames.join(', ')}`;
		}
	}
}

export function computeDelta(from: SchemaDecl, to: SchemaDecl): VersionDelta {
	const fromTables = new Set(Object.keys(from.tables));
	const toTables = new Set(Object.keys(to.tables));
	const fromIndexes = new Set(from.indexes);
	const toIndexes = new Set(to.indexes);

	const add_tables = Object.fromEntries(
		toTables
			.difference(fromTables)
			.keys()
			.map(name => [name, to.tables[name]])
	);

	const modify_tables: Record<string, TableDelta> = {};

	for (const name of fromTables.intersection(toTables)) {
		const fromTable = from.tables[name],
			toTable = to.tables[name];

		const fromColumns = new Set(Object.keys(fromTable));
		const toColumns = new Set(Object.keys(toTable));

		const drop_columns = fromColumns.difference(toColumns);
		const add_columns = Object.fromEntries(
			toColumns
				.difference(fromColumns)
				.keys()
				.map(colName => [colName, toTable[colName]])
		);

		const modify_columns = fromColumns.intersection(toColumns);
		if (modify_columns.size) throw 'No support for modifying columns yet: ' + [...modify_columns].map(c => `${name}.${c}`).join(', ');

		modify_tables[name] = { add_columns, drop_columns: Array.from(drop_columns) };
	}

	return {
		delta: true,
		add_tables,
		drop_tables: Array.from(fromTables.difference(toTables)),
		modify_tables,
		drop_indexes: Array.from(fromIndexes.difference(toIndexes)),
		add_indexes: Array.from(toIndexes.difference(fromIndexes)),
	};
}

export function collapseDeltas(deltas: VersionDelta[]): VersionDelta {
	const add_tables: Record<string, Table> = {},
		drop_tables: string[] = [],
		modify_tables: Record<string, TableDelta> = {},
		add_indexes: IndexString[] = [],
		drop_indexes: IndexString[] = [];

	for (const delta of deltas) {
		validateDelta(delta);

		for (const [name, table] of Object.entries(delta.modify_tables)) {
			if (name in add_tables) {
				applyTableDeltaToSchema(add_tables[name], table);
			} else if (name in modify_tables) {
				const existing = modify_tables[name];

				for (const [colName, column] of Object.entries(table.add_columns)) {
					existing.add_columns[colName] = column;
				}

				for (const colName of table.drop_columns) {
					if (colName in existing.add_columns) delete existing.add_columns[colName];
					else existing.drop_columns.push(colName);
				}
			} else modify_tables[name] = table;
		}

		for (const table of delta.drop_tables) {
			if (table in add_tables) delete add_tables[table];
			else drop_tables.push(table);
		}

		for (const [name, table] of Object.entries(delta.add_tables)) {
			if (drop_tables.includes(name)) throw `Can't add and drop table "${name}" in the same change`;
			if (name in modify_tables) throw `Can't add and modify table "${name}" in the same change`;
			add_tables[name] = table;
		}

		for (const index of delta.add_indexes) {
			if (drop_indexes.includes(index)) throw `Can't add and drop index "${index}" in the same change`;
			add_indexes.push(index);
		}

		for (const index of delta.drop_indexes) {
			if (add_indexes.includes(index)) throw `Can't add and drop index "${index}" in the same change`;
			drop_indexes.push(index);
		}
	}

	return { delta: true, add_tables, drop_tables, modify_tables, add_indexes, drop_indexes };
}

export function deltaIsEmpty(delta: VersionDelta): boolean {
	return (
		!Object.keys(delta.add_tables).length &&
		!delta.drop_tables.length &&
		!Object.keys(delta.modify_tables).length &&
		!delta.add_indexes.length &&
		!delta.drop_indexes.length
	);
}

const deltaColors = {
	'+': 'green',
	'-': 'red',
	'*': 'white',
} as const;

export function* displayDelta(delta: VersionDelta): Generator<string> {
	const tables = [
		...Object.keys(delta.add_tables).map(name => ({ op: '+' as const, name })),
		...Object.entries(delta.modify_tables).map(([name, changes]) => ({ op: '*' as const, name, changes })),
		...delta.drop_tables.map(name => ({ op: '-' as const, name })),
	];

	tables.sort((a, b) => a.name.localeCompare(b.name));

	for (const table of tables) {
		yield styleText(deltaColors[table.op], `${table.op} table ${table.name}`);

		if (table.op != '*') continue;

		const changes = [
			...Object.keys(table.changes.add_columns).map(name => ({ op: '+' as const, name })),
			...table.changes.drop_columns.map(name => ({ op: '-' as const, name })),
		];

		changes.sort((a, b) => a.name.localeCompare(b.name));

		for (const change of changes) {
			yield '\t' + styleText(deltaColors[change.op], `${change.op} ${change.name}`);
		}
	}

	const indexes = [
		...delta.add_indexes.map(raw => ({ op: '+' as const, ...parseIndex(raw) })),
		...delta.drop_indexes.map(raw => ({ op: '-' as const, ...parseIndex(raw) })),
	];

	indexes.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column));

	for (const index of indexes) {
		yield styleText(deltaColors[index.op], `${index.op} index on ${index.table}.${index.column}`);
	}
}

function columnFromSchema(column: Column, allowPK: boolean) {
	return function _addColumn(col: kysely.ColumnDefinitionBuilder) {
		if (column.primary && allowPK) col = col.primaryKey();
		if (column.unique) col = col.unique();
		if (column.required) col = col.notNull();
		if (column.references) col = col.references(column.references);
		if (column.onDelete) col = col.onDelete(column.onDelete);
		if ('default' in column) col = col.defaultTo(sql`${column.default}`);
		if (column.check) col = col.check(sql`${column.check}`);
		return col;
	};
}

export async function applyDelta(delta: VersionDelta): Promise<void> {
	await using tx = await database.startTransaction().execute();

	try {
		for (const [tableName, table] of Object.entries(delta.add_tables)) {
			io.start('Adding table ' + tableName);
			const create = tx.schema.createTable(tableName);
			const columns = Object.entries(table);
			const pkColumns = columns.filter(([, column]) => column.primary).map(([name]) => name);
			const needsPKConstraint = pkColumns.length > 1;
			for (const [colName, column] of columns) {
				create.addColumn(colName, sql`${column.type}`, columnFromSchema(column, !needsPKConstraint));
			}
			if (needsPKConstraint) create.addPrimaryKeyConstraint('PK_' + tableName.replaceAll('.', '_'), pkColumns as any);
			await create.execute();
			io.done();
		}

		for (const tableName of delta.drop_tables) {
			io.start('Dropping table ' + tableName);
			await tx.schema.dropTable(tableName).execute();
			io.done();
		}

		for (const [tableName, tableDelta] of Object.entries(delta.modify_tables)) {
			io.start(`Modifying table ${tableName}`);
			const query = tx.schema.alterTable(tableName) as any as kysely.AlterTableColumnAlteringBuilder;
			for (const colName of tableDelta.drop_columns) {
				query.dropColumn(colName);
			}

			for (const [colName, column] of Object.entries(tableDelta.add_columns)) {
				query.addColumn(colName, sql`${column.type}`, columnFromSchema(column, false));
			}

			await query.execute();
			io.done();
		}

		io.start('Committing');
		await tx.commit().execute();
		io.done();
	} catch (e) {
		await tx.rollback().execute();
		throw e;
	}
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
export async function checkTableTypes<TB extends keyof Schema & string>(tableName: TB, types: Table, opt: CheckOptions): Promise<void> {
	io.start(`Checking table ${tableName}`);
	const dbTables = opt._metadata || (await database.introspection.getTables());
	const table = dbTables.find(t => (t.schema == 'public' ? t.name : `${t.schema}.${t.name}`) === tableName);
	if (!table) throw 'missing.';

	const columns = Object.fromEntries(table.columns.map(c => [c.name, c]));
	const _types = Object.entries(types) as Entries<typeof types>;

	for (const [i, [key, { type, required = false, default: _default }]] of _types.entries()) {
		io.progress(i, _types.length, key);
		const col = columns[key];
		const actualType = type in schemaToIntrospected ? schemaToIntrospected[type as keyof typeof schemaToIntrospected] : type;
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
