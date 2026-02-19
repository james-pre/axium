import * as io from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import { sql } from 'kysely';
import type { Expand, MutableRecursive, ReadonlyRecursive } from 'utilium';
import * as z from 'zod';
import raw from './schema.json' with { type: 'json' };
import { database } from './connection.js';
import { buildColumn, Index, Table, type Column, type TableValue } from './data.js';
import * as delta from './delta.js';
export * from './data.js';

export const SchemaDecl = z.strictObject({
	tables: z.record(z.string(), Table),
	indexes: z.record(z.string(), Index),
});
export interface SchemaDecl extends z.infer<typeof SchemaDecl> {}

export const SchemaFile = z.object({
	format: z.literal(1),
	versions: z.discriminatedUnion('delta', [SchemaDecl.extend({ delta: z.literal(false) }), delta.Version]).array(),
	/** List of tables to wipe */
	wipe: z.string().array().optional().default([]),
	/** Set the latest version, defaults to the last one */
	latest: z.int32().nonnegative().optional(),
	/** Maps tables to their ACL tables, e.g. `"storage": "acl.storage"` */
	acl_tables: z.record(z.string(), z.string()).optional().default({}),
});
export interface SchemaFile extends z.infer<typeof SchemaFile> {}

const { data, error } = SchemaFile.safeParse(raw);
if (error) io.error('Invalid base database schema:\n' + z.prettifyError(error));
const schema = data!;

export function* getFiles(): Generator<[string, SchemaFile]> {
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

export type ApplyColumnDelta<C extends z.input<typeof Column>, D extends z.input<typeof delta.Column>> = Omit<
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

export type ApplyTableDelta<T extends z.input<typeof Table>, D extends z.input<typeof delta.Table>> = {
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

export type ApplySchemaDelta<S extends z.input<typeof SchemaDecl>, D extends z.input<typeof delta.Version>> = {
	tables: {
		[K in keyof S['tables'] as K extends (D extends { drop_tables: any[] } ? D['drop_tables'][number] : never)
			? never
			: K]: K extends keyof (D extends { alter_tables: any } ? D['alter_tables'] : {})
			? ApplyTableDelta<S['tables'][K], (D['alter_tables'] & {})[K & keyof D['alter_tables']]>
			: S['tables'][K];
	} & (D extends { add_tables: infer A } ? A : {});
	indexes: {
		[K in keyof S['indexes'] as K extends (D extends { drop_indexes: any[] } ? D['drop_indexes'][number] : never)
			? never
			: K]: S['indexes'][K];
	};
};

type ResolveVersions<
	V extends readonly any[],
	Current extends z.input<typeof SchemaDecl> = { tables: {}; indexes: {} },
> = V extends readonly [
	infer Head extends z.input<typeof delta.Version> | (z.input<typeof SchemaDecl> & { delta: false }),
	...infer Tail extends (z.input<typeof delta.Version> | (z.input<typeof SchemaDecl> & { delta: false }))[],
]
	? Head extends z.input<typeof delta.Version>
		? ResolveVersions<Tail, ApplySchemaDelta<Current, Head>>
		: Head extends z.input<typeof SchemaDecl>
			? ResolveVersions<Tail, Head>
			: never
	: Current;

export type FullSchema<S extends z.input<typeof SchemaFile>> = ResolveVersions<S['versions']>;

type _DBFromSchema<TBs extends Record<string, z.input<typeof Table>>> = {
	[K in keyof TBs]: Expand<TableValue<TBs[K]>>;
};

/**
 * Convert an entire schema definition file info the Kysely database schema type
 */
export type FromFile<S extends ReadonlyRecursive<z.input<typeof SchemaFile>>> = _DBFromSchema<FullSchema<MutableRecursive<S>>['tables']>;

/**@deprecated use {@link FromFile} */
export type DatabaseFromSchemaFile<S extends ReadonlyRecursive<z.input<typeof SchemaFile>>> = FromFile<S>;

/** @internal @hidden */
export type Raw = FromFile<typeof raw>;

/**
 * Get the active schema
 */
export function getFull(opt: { exclude?: string[] } = {}): SchemaDecl & { versions: Record<string, number> } {
	const fullSchema: SchemaDecl & { versions: Record<string, number> } = { tables: {}, indexes: {}, versions: {} };

	for (const [pluginName, file] of getFiles()) {
		if (opt.exclude?.includes(pluginName)) continue;

		file.latest ??= file.versions.length - 1;

		let currentSchema: SchemaDecl = { tables: {}, indexes: {} };

		fullSchema.versions[pluginName] = file.latest;
		for (const [version, schema] of file.versions.entries()) {
			if (!schema.delta) currentSchema = schema;
			else {
				try {
					delta.applyToSchema(currentSchema, schema);
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

		for (const index of Object.keys(currentSchema.indexes)) {
			if (fullSchema.indexes[index]) throw 'Duplicate index in database schema: ' + index;
			fullSchema.indexes[index] = currentSchema.indexes[index];
		}
	}

	return fullSchema;
}

export function* toSQL(schema: SchemaDecl): Generator<string> {
	for (const [tableName, table] of Object.entries(schema.tables)) {
		let query = database.schema.createTable(tableName);

		const columns = Object.entries(table.columns);
		const pkColumns = columns.filter(([, column]) => column.primary).map(([name, column]) => ({ name, ...column }));
		const needsSpecialConstraint = pkColumns.length > 1 || pkColumns.some(col => !col.required);
		for (const [colName, column] of columns) {
			query = query.addColumn(colName, sql.raw(column.type), buildColumn(column, !needsSpecialConstraint));
		}
		if (needsSpecialConstraint) {
			query = query.addPrimaryKeyConstraint('PK_' + tableName.replaceAll('.', '_'), pkColumns.map(col => col.name) as any);
		}

		yield query.compile().sql + ';\n';
	}

	for (const [indexName, index] of Object.entries(schema.indexes)) {
		const query = database.schema.createIndex(indexName).on(index.on).columns(index.columns).compile().sql;

		yield query + ';\n';
	}
}

export function* toGraph(schema: SchemaDecl): Generator<string> {
	const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
	const nodeId = (table: string) => table.replaceAll('.', '__');

	const edges: { fromTable: string; fromCol: string; toTable: string; toCol: string }[] = [];

	yield `digraph schema {
	graph [
		bgcolor="#111111",
		overlap=false,
		pad=0.5,
		concentrate=true,
		nodesep=1.0,
		rankdir=LR,
		size="16,9!",
		ratio="fill"
	];
	node [color="#c6c5fe",
		fontcolor="#c6c5fe",
		fontname=monospace,
		fontsize="14px",
		height=0,
		label="\\N",
		shape=plain,
		style=rounded
	];
	edge [color="#757575"];	
	`;

	for (const [tableName, table] of Object.entries(schema.tables)) {
		const id = nodeId(tableName);

		for (const constraint of Object.values(table.constraints)) {
			if (constraint.type !== 'foreign_key') continue;
			for (let i = 0; i < constraint.on.length; i++) {
				edges.push({
					fromTable: tableName,
					fromCol: constraint.on[i],
					toTable: constraint.target,
					toCol: constraint.references[i],
				});
			}
		}

		yield `\t${id} [label=<\n`;
		yield '\t\t<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">\n';
		yield `\t\t\t<TR><TD COLSPAN="3" BGCOLOR="#44C2C4"><B>${esc(tableName)}</B></TD></TR>\n`;

		for (const [colName, column] of Object.entries(table.columns)) {
			const nullable = !column.required ? '?' : '';
			const typeText = esc(column.type) + nullable;

			let label = `${esc(colName)}: ${column.references ? `<I>${typeText}</I>` : typeText}`;
			if (column.primary) label = `<B>${label}</B>`;

			if (column.references) {
				const [toTable, toCol] = column.references.split('.');
				edges.push({ fromTable: tableName, fromCol: colName, toTable, toCol });
			}

			yield `\t\t\t<TR><TD PORT="${esc(colName)}_l" WIDTH="2"></TD><TD ALIGN="LEFT">${label}</TD><TD PORT="${esc(colName)}_r" WIDTH="2"></TD></TR>\n`;
		}

		yield '\t\t</TABLE>\n\t>];\n\n';
	}

	for (const { fromTable, fromCol, toTable, toCol } of edges) {
		if (fromTable != toTable) {
			yield `\t${nodeId(fromTable)}:${fromCol}_r -> ${nodeId(toTable)}:${toCol}_l;\n`;
			continue;
		}

		const id = nodeId(fromTable);
		yield `\t${id}:${fromCol}_l:w -> ${id}:${toCol}_l:w [constraint=false];\n`;
	}

	yield '}\n';
}

export const toIntrospected = {
	boolean: 'bool',
	integer: 'int4',
	'text[]': '_text',
};
