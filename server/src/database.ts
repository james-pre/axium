import type { Preferences, UserInternal, VerificationRole } from '@axium/core';
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
import type { Entries, Expand, Filter, MutableRecursive, ReadonlyRecursive, Tuple, WithRequired } from 'utilium';
import * as z from 'zod';
import config from './config.js';
import rawSchema from './db.json' with { type: 'json' };
import { dirs, systemDir } from './io.js';

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
	connect();
	io.done();

	io.start('Creating schema acl');
	await database.schema.createSchema('acl').execute().then(io.done).catch(warnExists);
}

const numberTypes = [
	'integer',
	'int2',
	'int4',
	'int8',
	'smallint',
	'real',
	'double precision',
	'float4',
	'float8',
	'decimal',
	'numeric',
	'serial',
] as const;
const bigintTypes = ['bigint', 'bigserial'] as const;
const booleanTypes = ['boolean', 'bool'] as const;
const stringTypes = ['varchar', 'char', 'text'] as const;
const dateTypes = ['date', 'datetime', 'time', 'timetz', 'timestamp', 'timestamptz'] as const;
const binaryTypes = ['binary', 'bytea', 'varbinary', 'blob'] as const;
const numericRangeTypes = ['int4range', 'numrange'] as const;
const stringRangeTypes = ['tsrange', 'tstzrange', 'daterange'] as const;
const multirangeTypes = ['int4multirange', 'int8multirange', 'nummultirange', 'tsmultirange', 'tstzmultirange', 'datemultirange'] as const;

const _primitive = z.literal([
	...numberTypes,
	...bigintTypes,
	...booleanTypes,
	...stringTypes,
	...dateTypes,
	...binaryTypes,
	...numericRangeTypes,
	...stringRangeTypes,
	...multirangeTypes,
	'uuid',
	'json',
	'jsonb',
]);

const _ColumnType = z.union([
	_primitive,
	z.templateLiteral([
		z.literal(['char', 'varchar', 'binary', 'varbinary', 'datetime', 'time', 'timetz', 'timestamp', 'timestamptz']),
		'(',
		z.int().nonnegative(),
		')',
	]),
	z.templateLiteral([z.literal(['decimal', 'numeric']), '(', z.int().nonnegative(), z.literal([',', ', ']), z.int().nonnegative(), ')']),
]);

const ColumnType = z.union([_ColumnType, z.templateLiteral([_ColumnType, '[', z.int().nonnegative().optional(), ']'])]);

export type ColumnType = z.infer<typeof ColumnType>;

export const Column = z.strictObject({
	type: ColumnType,
	required: z.boolean().default(false),
	unique: z.boolean().default(false),
	primary: z.boolean().default(false),
	references: z.string().optional(),
	onDelete: z.enum(['cascade', 'restrict', 'no action', 'set null', 'set default']).optional(),
	default: z.any().optional(),
	check: z.string().optional(),
});
export interface Column extends z.infer<typeof Column> {}

export const Constraint = z.discriminatedUnion('type', [
	z.strictObject({
		type: z.literal('primary_key'),
		on: z.string().array(),
	}),
	z.strictObject({
		type: z.literal('foreign_key'),
		on: z.string().array(),
		target: z.string(),
		references: z.string().array(),
	}),
	z.strictObject({
		type: z.literal('unique'),
		on: z.string().array(),
		nulls_not_distinct: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal('check'),
		check: z.string(),
	}),
]);

export type Constraint = z.infer<typeof Constraint>;

export const Table = z.strictObject({
	columns: z.record(z.string(), Column),
	constraints: z.record(z.string(), Constraint).optional().default({}),
});
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

export const ColumnDelta = z.strictObject({
	type: ColumnType.optional(),
	default: z.string().optional(),
	ops: z.literal(['drop_default', 'set_required', 'drop_required']).array().optional(),
});
export interface ColumnDelta extends z.infer<typeof ColumnDelta> {}

export const TableDelta = z.strictObject({
	add_columns: z.record(z.string(), Column).optional().default({}),
	drop_columns: z.string().array().optional().default([]),
	alter_columns: z.record(z.string(), ColumnDelta).optional().default({}),
	add_constraints: z.record(z.string(), Constraint).optional().default({}),
	drop_constraints: z.string().array().optional().default([]),
});
export interface TableDelta extends z.infer<typeof TableDelta> {}

export const VersionDelta = z.strictObject({
	delta: z.literal(true),
	add_tables: z.record(z.string(), Table).optional().default({}),
	drop_tables: z.string().array().optional().default([]),
	alter_tables: z.record(z.string(), TableDelta).optional().default({}),
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
	latest: z.int32().nonnegative().optional(),
	/** Maps tables to their ACL tables, e.g. `"storage": "acl.storage"` */
	acl_tables: z.record(z.string(), z.string()).optional().default({}),
});
export interface SchemaFile extends z.infer<typeof SchemaFile> {}

const { data, error } = SchemaFile.safeParse(rawSchema);
if (error) io.error('Invalid base database schema:\n' + z.prettifyError(error));
const schema = data!;

export function* getSchemaFiles(): Generator<[string, SchemaFile]> {
	yield ['@axium/server', schema];

	for (const [name, plugin] of plugins) {
		if (!plugin._db) continue;
		try {
			yield [name, SchemaFile.parse(plugin._db)];
		} catch (e) {
			throw `Invalid database configuration for plugin "${name}":\n${io.errorText(e)}`;
		}
	}
}

export type ApplyColumnDelta<C extends z.input<typeof Column>, D extends z.input<typeof ColumnDelta>> = Omit<
	C,
	'type' | 'default' | 'required'
> & {
	type: D extends { type: infer T } ? T : C['type'];
	default: D extends { ops: readonly any[] }
		? 'drop_default' extends D['ops'][number]
			? undefined
			: D extends { default: infer Def }
				? Def
				: C['default']
		: D extends { default: infer Def }
			? Def
			: C['default'];
	required: D extends { ops: readonly any[] }
		? 'set_required' extends D['ops'][number]
			? true
			: 'drop_required' extends D['ops'][number]
				? false
				: C['required']
		: C['required'];
};

export type ApplyTableDelta<T extends z.input<typeof Table>, D extends z.input<typeof TableDelta>> = {
	columns: {
		[K in keyof T['columns'] as K extends (D extends { drop_columns: any[] } ? D['drop_columns'][number] : never)
			? never
			: K]: K extends keyof (D extends { alter_columns: any } ? D['alter_columns'] : {})
			? ApplyColumnDelta<T['columns'][K], (D['alter_columns'] & {})[K & keyof D['alter_columns']]>
			: T['columns'][K];
	} & (D extends { add_columns: infer A } ? A : {});
	constraints: {
		[K in keyof T['constraints'] as K extends (D extends { drop_constraints: any[] } ? D['drop_constraints'][number] : never)
			? never
			: K]: T['constraints'][K];
	} & (D extends { add_constraints: infer A } ? A : {});
};

export type ApplyDeltaToSchema<S extends z.input<typeof SchemaDecl>, D extends z.input<typeof VersionDelta>> = {
	tables: {
		[K in keyof S['tables'] as K extends (D extends { drop_tables: any[] } ? D['drop_tables'][number] : never)
			? never
			: K]: K extends keyof (D extends { alter_tables: any } ? D['alter_tables'] : {})
			? ApplyTableDelta<S['tables'][K], (D['alter_tables'] & {})[K & keyof D['alter_tables']]>
			: S['tables'][K];
	} & (D extends { add_tables: infer A } ? A : {});
	indexes: D extends { add_indexes: infer Add; drop_indexes: infer Drop }
		? [...Filter<Drop extends readonly any[] ? Drop[number] : never, S['indexes'] & {}>, ...(Add extends readonly any[] ? Add : [])]
		: S['indexes'];
};

type ResolveVersions<
	V extends readonly any[],
	Current extends z.input<typeof SchemaDecl> = { tables: {}; indexes: [] },
> = V extends readonly [
	infer Head extends z.input<typeof VersionDelta> | (z.input<typeof SchemaDecl> & { delta: false }),
	...infer Tail extends (z.input<typeof VersionDelta> | (z.input<typeof SchemaDecl> & { delta: false }))[],
]
	? Head extends z.input<typeof VersionDelta>
		? ResolveVersions<Tail, ApplyDeltaToSchema<Current, Head>>
		: Head extends z.input<typeof SchemaDecl>
			? ResolveVersions<Tail, Head>
			: never
	: Current;

export type FullSchema<S extends z.input<typeof SchemaFile>> = ResolveVersions<S['versions']>;

type __RangeContent = string | number | bigint | boolean | null | undefined;

type _Range<T extends __RangeContent> = `${'(' | '['}${T},${T}${')' | ']'}`;

type _MultiRange = `{${string}}`;

interface ColumnValueMap
	extends
		Record<(typeof numberTypes)[number], number>,
		Record<(typeof bigintTypes)[number], bigint>,
		Record<(typeof booleanTypes)[number], boolean>,
		Record<(typeof stringTypes)[number], string>,
		Record<(typeof dateTypes)[number], Date>,
		Record<(typeof binaryTypes)[number], Uint8Array<ArrayBuffer>>,
		Record<(typeof numericRangeTypes)[number], _Range<number>>,
		Record<(typeof stringRangeTypes)[number], _Range<string>>,
		Record<(typeof multirangeTypes)[number], _MultiRange> {
	int8range: _Range<bigint>;
	uuid: string;
	json: any;
	jsonb: any;
}

type ColumnTypeToValue<T extends ColumnType> = T extends `${infer CT extends z.infer<typeof _ColumnType>}[${infer N extends '' | number}]`
	? N extends number
		? Tuple<ColumnTypeToValue<CT>, N>
		: ColumnTypeToValue<CT>[]
	: T extends `${infer Base extends z.infer<typeof _primitive>}(${string})`
		? ColumnTypeToValue<Base>
		: T extends keyof ColumnValueMap
			? ColumnValueMap[T]
			: never;

/**
 * Convert a column definition into the Kysely database schema type
 */
export type ColumnSchema<T extends z.input<typeof Column>> = T['default'] extends {}
	? kysely.Generated<ColumnTypeToValue<T['type']>>
	: T['required'] extends true
		? ColumnTypeToValue<T['type']>
		: ColumnTypeToValue<T['type']> | null;

/**
 * Convert a table definition into the Kysely database schema type
 */
export type TableSchema<T extends z.input<typeof Table>> = {
	[K in keyof T['columns']]: ColumnSchema<T['columns'][K]>;
};

type _DBFromSchema<TBs extends Record<string, z.input<typeof Table>>> = {
	[K in keyof TBs]: Expand<TableSchema<TBs[K]>>;
};

/**
 * Convert an entire schema definition file info the Kysely database schema type
 */
export type DatabaseFromSchemaFile<S extends ReadonlyRecursive<z.input<typeof SchemaFile>>> = _DBFromSchema<
	FullSchema<MutableRecursive<S>>['tables']
>;

type RawDB = DatabaseFromSchemaFile<typeof rawSchema>;

export interface Schema extends Omit<RawDB, 'users' | 'verifications' | 'passkeys'> {
	users: Expand<
		RawDB['users'] & {
			preferences: kysely.Generated<Preferences>;
		}
	>;

	verifications: Expand<
		RawDB['verifications'] & {
			role: VerificationRole;
		}
	>;

	passkeys: Expand<
		Omit<RawDB['passkeys'], 'transports'> & {
			deviceType: CredentialDeviceType;
			transports: AuthenticatorTransportFuture[];
		}
	>;
	[key: `acl.${string}`]: DBAccessControl & Record<string, unknown>;
}

/**
 * Get the active schema
 */
export function getFullSchema(opt: { exclude?: string[] } = {}): SchemaDecl & { versions: Record<string, number> } {
	const fullSchema: SchemaDecl & { versions: Record<string, number> } = { tables: {}, indexes: [], versions: {} };

	for (const [pluginName, file] of getSchemaFiles()) {
		if (opt.exclude?.includes(pluginName)) continue;

		file.latest ??= file.versions.length - 1;

		let currentSchema: SchemaDecl = { tables: {}, indexes: [] };

		fullSchema.versions[pluginName] = file.latest;
		for (const [version, schema] of file.versions.entries()) {
			if (!schema.delta) currentSchema = schema;
			else {
				try {
					applyDeltaToSchema(currentSchema, schema);
				} catch (e: unknown) {
					throw `Failed to apply version ${version - 1}->${version} delta to ${pluginName}: ${io.errorText(e)}`;
				}
			}

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

export function applyTableDeltaToSchema(table: Table, delta: TableDelta): void {
	for (const column of delta.drop_columns) {
		if (column in table.columns) delete table.columns[column];
		else throw `can't drop column ${column} because it does not exist`;
	}

	for (const [name, column] of Object.entries(delta.add_columns)) {
		if (name in table.columns) throw `can't add column ${name} because it already exists`;
		table.columns[name] = column;
	}

	for (const [name, columnDelta] of Object.entries(delta.alter_columns)) {
		const column = table.columns[name];
		if (!column) throw `can't modify column ${name} because it does not exist`;
		if (columnDelta.type) column.type = columnDelta.type!;
		if (columnDelta.default) column.default = columnDelta.default!;
		for (const op of columnDelta.ops || []) {
			switch (op) {
				case 'drop_default':
					delete column.default;
					break;
				case 'set_required':
					column.required = true;
					break;
				case 'drop_required':
					column.required = false;
					break;
			}
		}
	}

	for (const name of delta.drop_constraints) {
		if (table.constraints[name]) delete table.constraints[name];
		else throw `can't drop constraint ${name} because it does not exist`;
	}

	for (const [name, constraint] of Object.entries(delta.add_constraints)) {
		if (table.constraints[name]) throw `can't add constraint ${name} because it already exists`;
		table.constraints[name] = constraint;
	}
}

export function applyDeltaToSchema(schema: SchemaDecl, delta: VersionDelta): void {
	for (const tableName of delta.drop_tables) {
		if (tableName in schema.tables) delete schema.tables[tableName];
		else throw `can't drop table ${tableName} because it does not exist`;
	}

	for (const [tableName, table] of Object.entries(delta.add_tables)) {
		if (tableName in schema.tables) throw `can't add table ${tableName} because it already exists`;
		else schema.tables[tableName] = table;
	}

	for (const [tableName, tableDelta] of Object.entries(delta.alter_tables)) {
		if (tableName in schema.tables) applyTableDeltaToSchema(schema.tables[tableName], tableDelta);
		else throw `can't modify table ${tableName} because it does not exist`;
	}
}

export function validateDelta(delta: VersionDelta): void {
	const tableNames = [...Object.keys(delta.add_tables), ...Object.keys(delta.alter_tables), delta.drop_tables];
	const uniqueTables = new Set(tableNames);
	for (const table of uniqueTables) {
		tableNames.splice(tableNames.indexOf(table), 1);
	}

	if (tableNames.length) {
		throw `Duplicate table name(s): ${tableNames.join(', ')}`;
	}

	for (const [tableName, table] of Object.entries(delta.alter_tables)) {
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

	const alter_tables: Record<string, TableDelta> = {};

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
				.map(colName => [colName, toTable.columns[colName]])
		);

		const alter_columns = Object.fromEntries(
			toColumns
				.intersection(fromColumns)
				.keys()
				.map(name => {
					const fromCol = fromTable.columns[name],
						toCol = toTable.columns[name];
					const alter: WithRequired<ColumnDelta, 'ops'> = { ops: [] };

					if ('default' in fromCol && !('default' in toCol)) alter.ops.push('drop_default');
					else if (fromCol.default !== toCol.default) alter.default = toCol.default;
					if (fromCol.type != toCol.type) alter.type = toCol.type;
					if (fromCol.required != toCol.required) alter.ops.push(toCol.required ? 'set_required' : 'drop_required');

					return [name, alter];
				})
		);

		const fromConstraints = new Set(Object.keys(fromTable.constraints || {}));
		const toConstraints = new Set(Object.keys(toTable.constraints || {}));

		const drop_constraints = fromConstraints.difference(toConstraints);
		const add_constraints = Object.fromEntries(
			toConstraints
				.difference(fromConstraints)
				.keys()
				.map(constName => [constName, toTable.constraints[constName]])
		);

		alter_tables[name] = {
			add_columns,
			drop_columns: Array.from(drop_columns),
			alter_columns,
			add_constraints,
			drop_constraints: Array.from(drop_constraints),
		};
	}

	return {
		delta: true,
		add_tables,
		drop_tables: Array.from(fromTables.difference(toTables)),
		alter_tables,
		drop_indexes: Array.from(fromIndexes.difference(toIndexes)),
		add_indexes: Array.from(toIndexes.difference(fromIndexes)),
	};
}

export function collapseDeltas(deltas: VersionDelta[]): VersionDelta {
	const add_tables: Record<string, Table> = {},
		drop_tables: string[] = [],
		alter_tables: Record<string, TableDelta> = {},
		add_indexes: IndexString[] = [],
		drop_indexes: IndexString[] = [];

	for (const delta of deltas) {
		validateDelta(delta);

		for (const [name, table] of Object.entries(delta.alter_tables)) {
			if (name in add_tables) {
				applyTableDeltaToSchema(add_tables[name], table);
			} else if (name in alter_tables) {
				const existing = alter_tables[name];

				for (const [colName, column] of Object.entries(table.add_columns)) {
					existing.add_columns[colName] = column;
				}

				for (const colName of table.drop_columns) {
					if (colName in existing.add_columns) delete existing.add_columns[colName];
					else existing.drop_columns.push(colName);
				}
			} else alter_tables[name] = table;
		}

		for (const table of delta.drop_tables) {
			if (table in add_tables) delete add_tables[table];
			else drop_tables.push(table);
		}

		for (const [name, table] of Object.entries(delta.add_tables)) {
			if (drop_tables.includes(name)) throw `Can't add and drop table "${name}" in the same change`;
			if (name in alter_tables) throw `Can't add and modify table "${name}" in the same change`;
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

	return { delta: true, add_tables, drop_tables, alter_tables, add_indexes, drop_indexes };
}

export function deltaIsEmpty(delta: VersionDelta): boolean {
	return (
		!Object.keys(delta.add_tables).length &&
		!delta.drop_tables.length &&
		!Object.keys(delta.alter_tables).length &&
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
		...Object.entries(delta.alter_tables).map(([name, changes]) => ({ op: '*' as const, name, changes })),
		...delta.drop_tables.map(name => ({ op: '-' as const, name })),
	];

	tables.sort((a, b) => a.name.localeCompare(b.name));

	for (const table of tables) {
		yield styleText(deltaColors[table.op], `${table.op} table ${table.name}`);

		if (table.op != '*') continue;

		const columns = [
			...Object.keys(table.changes.add_columns).map(name => ({ op: '+' as const, name })),
			...table.changes.drop_columns.map(name => ({ op: '-' as const, name })),
			...Object.entries(table.changes.alter_columns).map(([name, changes]) => ({ op: '*' as const, name, ...changes })),
		];

		columns.sort((a, b) => a.name.localeCompare(b.name));

		for (const column of columns) {
			const columnChanges =
				column.op == '*'
					? [...(column.ops ?? []), 'default' in column && 'set_default', 'type' in column && 'set_type']
							.filter((e): e is string => !!e)
							.map(e => e.replaceAll('_', ' '))
							.join(', ')
					: null;
			yield '\t' +
				styleText(deltaColors[column.op], `${column.op} column ${column.name}${column.op != '*' ? '' : ': ' + columnChanges}`);
		}

		const constraints = [
			...Object.keys(table.changes.add_constraints).map(name => ({ op: '+' as const, name })),
			...table.changes.drop_constraints.map(name => ({ op: '-' as const, name })),
		];

		for (const con of constraints) {
			yield '\t' + styleText(deltaColors[con.op], `${con.op} constraint ${con.name}`);
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
		else if (column.unique) col = col.nullsNotDistinct();
		if (column.references) col = col.references(column.references);
		if (column.onDelete) col = col.onDelete(column.onDelete);
		if ('default' in column) col = col.defaultTo(sql.raw(column.default));
		if (column.check) col = col.check(sql.raw(column.check));
		return col;
	};
}

export async function applyDelta(delta: VersionDelta, forceAbort: boolean = false): Promise<void> {
	const tx = await database.startTransaction().execute();

	try {
		for (const [tableName, table] of Object.entries(delta.add_tables)) {
			io.start('Adding table ' + tableName);
			let query = tx.schema.createTable(tableName);
			const columns = Object.entries(table.columns);
			const pkColumns = columns.filter(([, column]) => column.primary).map(([name, column]) => ({ name, ...column }));
			const needsSpecialConstraint = pkColumns.length > 1 || pkColumns.some(col => !col.required);
			for (const [colName, column] of columns) {
				query = query.addColumn(colName, sql.raw(column.type), columnFromSchema(column, !needsSpecialConstraint));
			}
			if (needsSpecialConstraint) {
				query = query.addPrimaryKeyConstraint('PK_' + tableName.replaceAll('.', '_'), pkColumns.map(col => col.name) as any);
			}
			await query.execute();
			io.done();
		}

		for (const tableName of delta.drop_tables) {
			io.start('Dropping table ' + tableName);
			await tx.schema.dropTable(tableName).execute();
			io.done();
		}

		for (const [tableName, tableDelta] of Object.entries(delta.alter_tables)) {
			io.start(`Modifying table ${tableName}`);
			const query = tx.schema.alterTable(tableName);

			for (const constraint of tableDelta.drop_constraints) {
				await query.dropConstraint(constraint).execute();
			}

			for (const colName of tableDelta.drop_columns) {
				await query.dropColumn(colName).execute();
			}

			for (const [colName, column] of Object.entries(tableDelta.add_columns)) {
				await query.addColumn(colName, sql.raw(column.type), columnFromSchema(column, false)).execute();
			}

			for (const [colName, column] of Object.entries(tableDelta.alter_columns)) {
				if (column.default) await query.alterColumn(colName, col => col.setDefault(sql.raw(column.default!))).execute();
				if (column.type) await query.alterColumn(colName, col => col.setDataType(sql.raw(column.type!))).execute();
				for (const op of column.ops ?? []) {
					switch (op) {
						case 'drop_default':
							if (column.default) throw 'Cannot set and drop default at the same time';
							await query.alterColumn(colName, col => col.dropDefault()).execute();
							break;
						case 'set_required':
							await query.alterColumn(colName, col => col.setNotNull()).execute();
							break;
						case 'drop_required':
							await query.alterColumn(colName, col => col.dropNotNull()).execute();
							break;
					}
				}
			}

			for (const [name, con] of Object.entries(tableDelta.add_constraints)) {
				switch (con.type) {
					case 'unique':
						await query.addUniqueConstraint(name, con.on, b => (con.nulls_not_distinct ? b.nullsNotDistinct() : b)).execute();
						break;
					case 'check':
						await query.addCheckConstraint(name, sql.raw(con.check)).execute();
						break;
					case 'foreign_key':
						await query.addForeignKeyConstraint(name, con.on, con.target, con.references, b => b).execute();
						break;
					case 'primary_key':
						await query.addPrimaryKeyConstraint(name, con.on).execute();
						break;
				}
			}

			io.done();
		}

		if (forceAbort) throw 'Rolling back due to --abort';

		io.start('Committing');
		await tx.commit().execute();
		io.done();
	} catch (e) {
		await tx.rollback().execute();
		if (e instanceof SuppressedError) io.error(e.suppressed);
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
export async function checkTableTypes<TB extends keyof Schema & string>(
	tableName: TB,
	types: Table,
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
