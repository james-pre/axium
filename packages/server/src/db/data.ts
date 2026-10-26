/**
 * - Zod schemas for the DB schema config
 * - DB config const type -> value type used by Kysely
 */
import { sql, type ColumnDefinitionBuilder, type CreateTableBuilder, type Expression, type Generated, type SchemaModule } from 'kysely';
import type { Tuple } from 'utilium';
import * as z from 'zod';

const numberTypes = [
	'integer',
	'int2',
	'int4',
	'smallint',
	'real',
	'double precision',
	'float4',
	'float8',
	'decimal',
	'numeric',
	'serial',
] as const;
const bigintTypes = ['int8', 'bigint', 'bigserial'] as const;
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

export const ColumnType = z.union([_ColumnType, z.templateLiteral([_ColumnType, '[', z.int().nonnegative().optional(), ']'])]);

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

export const Trigger = z.strictObject({
	from: z.string().optional(),
	when: z.literal(['before', 'after']),
	events: z.literal(['insert', 'update', 'delete']).array(),
	referenceOldAs: z.string().optional(),
	referenceNewAs: z.string().optional(),
	forEach: z.literal(['row', 'statement']).default('statement'),
	execute: z.string(),
});
export interface Trigger extends z.infer<typeof Trigger> {}

export const Table = z.strictObject({
	columns: z.record(z.string(), Column),
	constraints: z.record(z.string(), Constraint).optional().default({}),
	triggers: z.record(z.string(), Trigger).optional().default({}),
});
export interface Table extends z.infer<typeof Table> {}

export const Index = z.strictObject({
	on: z.string(),
	columns: z.string().array(),
});
export interface Index extends z.infer<typeof Index> {}

export const Script = z.strictObject({
	when: z.literal(['before', 'after']),
	path: z.string(),
});
export interface Script extends z.infer<typeof Script> {}

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
	json: {};
	jsonb: {};
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
export type ColumnValue<T extends z.input<typeof Column>> = T['default'] extends {}
	? Generated<ColumnTypeToValue<T['type']>>
	: T['required'] extends true
		? ColumnTypeToValue<T['type']>
		: ColumnTypeToValue<T['type']> | null;

/**
 * Convert a table definition into the Kysely database schema type
 */
export type TableValue<T extends z.input<typeof Table>> = {
	[K in keyof T['columns']]: ColumnValue<T['columns'][K]>;
};

export function buildColumn(column: Column, allowPK: boolean) {
	return function _addColumn(col: ColumnDefinitionBuilder) {
		if (column.primary && allowPK) col = col.primaryKey();
		if (column.unique) col = col.unique();
		if (column.required) col = col.notNull();
		else if (column.unique) col = col.nullsNotDistinct();
		if (column.references) col = col.references(column.references);
		if (column.onDelete) col = col.onDelete(column.onDelete);
		if ('default' in column) col = col.defaultTo(sql.raw(String(column.default)));
		if (column.check) col = col.check(sql.raw(column.check));
		return col;
	};
}

interface ConstraintBuilder<T> {
	addPrimaryKeyConstraint(name: string, columns: string[]): T;
	addUniqueConstraint(
		name: string,
		columns: string[],
		build: NonNullable<Parameters<CreateTableBuilder<string, string>['addUniqueConstraint']>[2]>
	): T;
	addCheckConstraint(name: string, check: Expression<any>): T;
	addForeignKeyConstraint(name: string, columns: string[], targetTable: string, targetColumns: string[]): T;
}

/** Add a constraint with a create or alter table builder */
export function addConstraint<T>(builder: ConstraintBuilder<T>, name: string, constraint: Constraint): T {
	switch (constraint.type) {
		case 'primary_key':
			return builder.addPrimaryKeyConstraint(name, constraint.on);
		case 'unique':
			return builder.addUniqueConstraint(name, constraint.on, unique =>
				constraint.nulls_not_distinct ? unique.nullsNotDistinct() : unique
			);
		case 'check':
			return builder.addCheckConstraint(name, sql.raw(constraint.check));
		case 'foreign_key':
			return builder.addForeignKeyConstraint(name, constraint.on, constraint.target, constraint.references);
	}
}

/**
 * Build the query that creates a table, including its constraints.
 * Columns marked as primary form the primary key, unless the table has a primary key constraint.
 */
export function createTable(schema: SchemaModule, name: string, table: Table): CreateTableBuilder<string, string> {
	let query: CreateTableBuilder<string, string> = schema.createTable(name);

	const columns = Object.entries(table.columns);
	const constraints = Object.entries(table.constraints);
	const primaryColumns = columns.filter(([, column]) => column.primary);
	const hasPrimaryConstraint = constraints.some(([, constraint]) => constraint.type == 'primary_key');
	const needsSpecialConstraint =
		!hasPrimaryConstraint && (primaryColumns.length > 1 || primaryColumns.some(([, column]) => !column.required));

	for (const [columnName, column] of columns) {
		query = query.addColumn(columnName, sql.raw(column.type), buildColumn(column, !hasPrimaryConstraint && !needsSpecialConstraint));
	}

	if (needsSpecialConstraint) {
		query = query.addPrimaryKeyConstraint(
			'PK_' + name.replaceAll('.', '_'),
			primaryColumns.map(([columnName]) => columnName)
		);
	}

	for (const [constraintName, constraint] of constraints) query = addConstraint(query, constraintName, constraint);

	return query;
}
