import * as io from '@axium/core/node/io';
import { sql } from 'kysely';
import { styleText } from 'node:util';
import type { WithRequired } from 'utilium';
import * as z from 'zod';
import { database } from './connection.js';
import * as data from './data.js';
import type { SchemaDecl } from './schema.js';

export const Column = z.strictObject({
	type: data.ColumnType.optional(),
	default: z.string().optional(),
	ops: z.literal(['drop_default', 'set_required', 'drop_required']).array().optional(),
});
export interface Column extends z.infer<typeof Column> {}

export const Table = z.strictObject({
	add_columns: z.record(z.string(), data.Column).optional().default({}),
	drop_columns: z.string().array().optional().default([]),
	alter_columns: z.record(z.string(), Column).optional().default({}),
	add_constraints: z.record(z.string(), data.Constraint).optional().default({}),
	drop_constraints: z.string().array().optional().default([]),
});
export interface Table extends z.infer<typeof Table> {}

export function applyToTable(table: data.Table, delta: Table): void {
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

export const Version = z.strictObject({
	delta: z.literal(true),
	add_tables: z.record(z.string(), data.Table).optional().default({}),
	drop_tables: z.string().array().optional().default([]),
	alter_tables: z.record(z.string(), Table).optional().default({}),
	add_indexes: z.record(z.string(), data.Index).optional().default({}),
	drop_indexes: z.string().array().optional().default([]),
});
export interface Version extends z.infer<typeof Version> {}

export function applyToSchema(schema: SchemaDecl, delta: Version): void {
	for (const tableName of delta.drop_tables) {
		if (tableName in schema.tables) delete schema.tables[tableName];
		else throw `can't drop table ${tableName} because it does not exist`;
	}

	for (const [tableName, table] of Object.entries(delta.add_tables)) {
		if (tableName in schema.tables) throw `can't add table ${tableName} because it already exists`;
		else schema.tables[tableName] = table;
	}

	for (const [tableName, tableDelta] of Object.entries(delta.alter_tables)) {
		if (tableName in schema.tables) applyToTable(schema.tables[tableName], tableDelta);
		else throw `can't modify table ${tableName} because it does not exist`;
	}

	for (const indexName of delta.drop_indexes) {
		if (indexName in schema.indexes) delete schema.indexes[indexName];
		else throw `can't drop index ${indexName} because it does not exist`;
	}

	for (const [indexName, index] of Object.entries(delta.add_indexes)) {
		if (indexName in schema.indexes) throw `can't add index ${indexName} because it already exists`;
		else schema.indexes[indexName] = index;
	}
}

export function validate(delta: Version): void {
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

export function compute(from: SchemaDecl, to: SchemaDecl): Version {
	const fromTables = new Set(Object.keys(from.tables));
	const toTables = new Set(Object.keys(to.tables));
	const fromIndexes = new Set(Object.keys(from.indexes));
	const toIndexes = new Set(Object.keys(to.indexes));

	const add_tables = Object.fromEntries(
		toTables
			.difference(fromTables)
			.keys()
			.map(name => [name, to.tables[name]])
	);

	const alter_tables: Record<string, Table> = {};

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
					const alter: WithRequired<Column, 'ops'> = { ops: [] };

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

	const add_indexes = Object.fromEntries(
		toIndexes
			.difference(fromIndexes)
			.keys()
			.map(name => [name, to.indexes[name]])
	);

	return {
		delta: true,
		add_tables,
		drop_tables: Array.from(fromTables.difference(toTables)),
		alter_tables,
		drop_indexes: Array.from(fromIndexes.difference(toIndexes)),
		add_indexes,
	};
}

export function collapse(deltas: Version[]): Version {
	const add_tables: Record<string, data.Table> = {},
		drop_tables: string[] = [],
		alter_tables: Record<string, Table> = {},
		add_indexes: Record<string, data.Index> = {},
		drop_indexes: string[] = [];

	for (const delta of deltas) {
		validate(delta);

		for (const [name, table] of Object.entries(delta.alter_tables)) {
			if (name in add_tables) {
				applyToTable(add_tables[name], table);
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

		for (const index of delta.drop_indexes) {
			if (index in add_indexes) delete add_indexes[index];
			else drop_indexes.push(index);
		}

		for (const [name, table] of Object.entries(delta.add_tables)) {
			if (drop_tables.includes(name)) throw `Can't add and drop table "${name}" in the same change`;
			if (name in alter_tables) throw `Can't add and modify table "${name}" in the same change`;
			add_tables[name] = table;
		}

		for (const [name, index] of Object.entries(delta.add_indexes)) {
			if (drop_indexes.includes(name)) throw `Can't add and drop index "${name}" in the same change`;
			add_indexes[name] = index;
		}
	}

	return { delta: true, add_tables, drop_tables, alter_tables, add_indexes, drop_indexes };
}

export function isEmpty(delta: Version): boolean {
	return (
		!Object.keys(delta.add_tables).length &&
		!delta.drop_tables.length &&
		!Object.keys(delta.alter_tables).length &&
		!Object.keys(delta.add_indexes).length &&
		!delta.drop_indexes.length
	);
}

const deltaColors = {
	'+': 'green',
	'-': 'red',
	'*': 'white',
} as const;

export function* display(delta: Version): Generator<string> {
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
		...Object.keys(delta.add_indexes).map(name => ({ op: '+' as const, name })),
		...delta.drop_indexes.map(name => ({ op: '-' as const, name })),
	];

	indexes.sort((a, b) => a.name.localeCompare(b.name));

	for (const index of indexes) {
		yield styleText(deltaColors[index.op], `${index.op} index ${index.name}`);
	}
}

export async function apply(delta: Version, forceAbort: boolean = false): Promise<void> {
	const tx = await database.startTransaction().execute();

	try {
		for (const [tableName, table] of Object.entries(delta.add_tables)) {
			io.start('Adding table ' + tableName);
			let query = tx.schema.createTable(tableName);
			const columns = Object.entries(table.columns);
			const pkColumns = columns.filter(([, column]) => column.primary).map(([name, column]) => ({ name, ...column }));
			const needsSpecialConstraint = pkColumns.length > 1 || pkColumns.some(col => !col.required);
			for (const [colName, column] of columns) {
				query = query.addColumn(colName, sql.raw(column.type), data.buildColumn(column, !needsSpecialConstraint));
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
				await query.addColumn(colName, sql.raw(column.type), data.buildColumn(column, false)).execute();
			}

			for (const [colName, column] of Object.entries(tableDelta.alter_columns)) {
				if (column.default) await query.alterColumn(colName, col => col.setDefault(sql.raw(String(column.default)))).execute();
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

		for (const [indexName, index] of Object.entries(delta.add_indexes)) {
			io.start('Adding index ' + indexName);
			await tx.schema.createIndex(indexName).on(index.on).columns(index.columns).execute();
			io.done();
		}

		for (const index of delta.drop_indexes) {
			io.start('Dropping index ' + index);
			await tx.schema.dropIndex(index).execute();
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
