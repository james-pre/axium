/**
 * - Zod schemas for the DB schema config
 * - DB config const type -> value type used by Kysely
 */
import { sql, type ColumnDefinitionBuilder, type Generated } from 'kysely';
import type { Tuple } from 'utilium';
import * as z from 'zod';

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

export const Table = z.strictObject({
	columns: z.record(z.string(), Column),
	constraints: z.record(z.string(), Constraint).optional().default({}),
});
export interface Table extends z.infer<typeof Table> {}

export const Index = z.strictObject({
	on: z.string(),
	columns: z.string().array(),
});
export interface Index extends z.infer<typeof Index> {}

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
