import * as io from 'ioium/node';
import { sql } from 'kysely';
import { styleText, type InspectColor } from 'node:util';
import type { WithRequired } from 'utilium';
import * as z from 'zod';
import { database } from './connection.js';
import * as data from './data.js';
import type { SchemaDecl } from './schema.js';
import { readFileSync } from 'node:fs';

export const Column = z.strictObject({
	type: data.ColumnType.optional(),
	default: z.string().optional(),
	ops: z.literal(['drop_default', 'set_required', 'drop_required']).array().optional(),
});
export interface Column extends z.infer<typeof Column> {}

export function applyToColumn(column: data.Column, delta: Column): void {
	if (delta.type) column.type = delta.type!;
	if (delta.default) column.default = delta.default!;
	for (const op of delta.ops || []) {
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

export const RenameMap = z.record(z.string(), z.string()).optional().default({});

export const Table = z.strictObject({
	add_columns: z.record(z.string(), data.Column).optional().default({}),
	drop_columns: z.string().array().optional().default([]),
	alter_columns: z.record(z.string(), Column).optional().default({}),
	rename_columns: RenameMap,
	add_constraints: z.record(z.string(), data.Constraint).optional().default({}),
	drop_constraints: z.string().array().optional().default([]),
	rename_constraints: RenameMap,
	add_triggers: z.record(z.string(), data.Trigger).optional().default({}),
	drop_triggers: z.string().array().default([]),
	rename_to: z.string().nonempty().optional(),
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

	for (const [oldName, newName] of Object.entries(delta.rename_columns)) {
		if (!(oldName in table.columns)) throw `can't rename column ${oldName} because it does not exist`;
		if (newName in table.columns) throw `can't rename column ${oldName} to ${newName} because ${newName} already exists`;
		table.columns[newName] = table.columns[oldName];
		delete table.columns[oldName];
	}

	for (const [name, columnDelta] of Object.entries(delta.alter_columns)) {
		const column = table.columns[name];
		if (!column) throw `can't modify column ${name} because it does not exist`;
		applyToColumn(column, columnDelta);
	}

	for (const name of delta.drop_constraints) {
		if (table.constraints[name]) delete table.constraints[name];
		else throw `can't drop constraint ${name} because it does not exist`;
	}

	for (const [oldName, newName] of Object.entries(delta.rename_constraints)) {
		if (!table.constraints[oldName]) throw `can't rename constraint ${oldName} because it does not exist`;
		if (table.constraints[newName]) throw `can't rename constraint ${oldName} to ${newName} because ${newName} already exists`;
		table.constraints[newName] = table.constraints[oldName];
		delete table.constraints[oldName];
	}

	for (const [name, constraint] of Object.entries(delta.add_constraints)) {
		if (table.constraints[name]) throw `can't add constraint ${name} because it already exists`;
		table.constraints[name] = constraint;
	}

	for (const triggerName of delta.drop_triggers) {
		if (triggerName in table.triggers) delete table.triggers[triggerName];
		else throw `can't drop trigger ${triggerName} because it does not exist`;
	}

	for (const [triggerName, trigger] of Object.entries(delta.add_triggers)) {
		if (triggerName in table.triggers) throw `can't add trigger ${triggerName} because it already exists`;
		else table.triggers[triggerName] = trigger;
	}
}

export const Version = z.strictObject({
	delta: z.literal(true),
	add_tables: z.record(z.string(), data.Table).optional().default({}),
	drop_tables: z.string().array().optional().default([]),
	alter_tables: z.record(z.string(), Table).optional().default({}),
	add_indexes: z.record(z.string(), data.Index).optional().default({}),
	drop_indexes: z.string().array().optional().default([]),
	scripts: data.Script.array().default([]),
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
		if (!(tableName in schema.tables)) throw `can't modify table ${tableName} because it does not exist`;
		applyToTable(schema.tables[tableName], tableDelta);

		if (tableDelta.rename_to) {
			if (tableDelta.rename_to in schema.tables)
				throw `can't rename table ${tableName} to ${tableDelta.rename_to} because it already exists`;
			schema.tables[tableDelta.rename_to] = schema.tables[tableName];
			delete schema.tables[tableName];
		}
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

		for (const [oldName, newName] of Object.entries(table.rename_columns)) {
			if (oldName in table.alter_columns || newName in table.alter_columns) {
				io.warn(`Column "${oldName}" in table ${tableName} is both renamed and altered`);
			}
		}

		for (const [colName, column] of Object.entries(table.alter_columns)) {
			if (column.default && column.ops?.includes('drop_default')) {
				throw `Cannot set and drop default at the same time (column ${colName} in table ${tableName})`;
			}
		}
	}
}

export function compute(from: SchemaDecl, to: SchemaDecl): Version {
	const fromTables = new Set(Object.keys(from.tables));
	const toTables = new Set(Object.keys(to.tables));
	const fromIndexes = new Set(Object.keys(from.indexes));
	const toIndexes = new Set(Object.keys(to.indexes));
	const fromScripts = new Set(from.scripts);
	const toScripts = new Set(to.scripts);

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

		const fromTriggers = new Set(Object.keys(fromTable.triggers));
		const toTriggers = new Set(Object.keys(toTable.triggers));

		const add_triggers = Object.fromEntries(
			toTriggers
				.difference(fromTriggers)
				.keys()
				.map(name => [name, toTable.triggers[name]])
		);

		alter_tables[name] = {
			add_columns,
			drop_columns: Array.from(drop_columns),
			alter_columns,
			rename_columns: {},
			add_constraints,
			drop_constraints: Array.from(drop_constraints),
			rename_constraints: {},
			drop_triggers: Array.from(fromTriggers.difference(toTriggers)),
			add_triggers,
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
		scripts: Array.from(fromScripts.difference(toScripts)),
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
				if (table.rename_to) {
					add_tables[table.rename_to] = add_tables[name];
					delete add_tables[name];
				}
				continue;
			}

			const existing = alter_tables[name];

			if (!existing) {
				alter_tables[name] = table;
				continue;
			}

			Object.assign(existing.rename_columns, table.rename_columns);
			Object.assign(existing.rename_constraints, table.rename_constraints);
			if (table.rename_to) existing.rename_to = table.rename_to;

			for (const [colName, column] of Object.entries(table.add_columns)) {
				existing.add_columns[colName] = column;
			}

			for (const colName of table.drop_columns) {
				if (colName in existing.add_columns) delete existing.add_columns[colName];
				else existing.drop_columns.push(colName);
			}

			for (const [triggerName, trigger] of Object.entries(table.add_triggers)) {
				existing.add_triggers[triggerName] = trigger;
			}

			for (const triggerName of table.drop_triggers) {
				if (triggerName in existing.add_triggers) delete existing.add_triggers[triggerName];
				else existing.drop_triggers.push(triggerName);
			}

			for (const [colName, delta] of Object.entries(table.alter_columns)) {
				if (colName in existing.add_columns) {
					applyToColumn(existing.add_columns[colName], delta);
					continue;
				}

				const existingCol = existing.alter_columns[colName];

				if (!existingCol) {
					existing.alter_columns[colName] = delta;
					continue;
				}

				if ('default' in delta) existingCol.default = delta.default;
				if ('type' in delta) existingCol.type = delta.type;

				existingCol.ops ||= [];
				const { ops } = existingCol;
				for (const op of delta.ops || []) {
					if (ops.includes(op)) {
						io.debug(`Ignoring duplicate operation whilst resolving delta for ${name}.${colName}`);
						continue;
					}

					switch (op) {
						case 'drop_default':
							if ('default' in existingCol) delete existingCol.default;
							else ops.push(op);
							break;
						case 'set_required':
						case 'drop_required': {
							const i = ops.indexOf(op == 'set_required' ? 'drop_required' : 'set_required');

							if (i == -1) ops.push(op);
							else ops.splice(i, 1);

							break;
						}
					}
				}
			}
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

	return {
		delta: true,
		add_tables,
		drop_tables,
		alter_tables,
		add_indexes,
		drop_indexes,
		scripts: deltas.flatMap(v => v.scripts),
	};
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
} as const satisfies Record<string, InspectColor>;

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

		if (table.changes.rename_to) yield '\t' + styleText('yellow', `~ rename table -> ${table.changes.rename_to}`);

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

		for (const [oldName, newName] of Object.entries(table.changes.rename_columns)) {
			yield '\t' + styleText('yellow', `~ column ${oldName} -> ${newName}`);
		}

		const constraints = [
			...Object.keys(table.changes.add_constraints).map(name => ({ op: '+' as const, name })),
			...table.changes.drop_constraints.map(name => ({ op: '-' as const, name })),
		];

		for (const con of constraints) {
			yield '\t' + styleText(deltaColors[con.op], `${con.op} constraint ${con.name}`);
		}

		for (const [oldName, newName] of Object.entries(table.changes.rename_constraints)) {
			yield '\t' + styleText('yellow', `~ constraint ${oldName} -> ${newName}`);
		}

		const triggers = [
			...Object.keys(table.changes.add_triggers).map(name => ({ op: '+' as const, name })),
			...table.changes.drop_triggers.map(name => ({ op: '-' as const, name })),
		];

		triggers.sort((a, b) => a.name.localeCompare(b.name));

		for (const trigger of triggers) {
			yield '\t' + styleText(deltaColors[trigger.op], `${trigger.op} trigger ${trigger.name}`);
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

	for (const script of delta.scripts) {
		yield styleText('magentaBright', `! script at ${script.path}`);
	}
}

export async function apply(delta: Version, forceAbort: boolean = false): Promise<void> {
	const tx = await database.startTransaction().execute();

	const ForceAbort = Symbol('%ForceAbort%');

	try {
		for (const script of delta.scripts.filter(s => s.when === 'before')) {
			using _ = io.start('Running script at ' + script.path);
			const content = readFileSync(script.path, 'utf-8');
			await sql.raw(content).execute(tx);
			io.done();
		}

		for (const [tableName, table] of Object.entries(delta.add_tables)) {
			using _ = io.start('Adding table ' + tableName);
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
			await io.track('Dropping table ' + tableName, tx.schema.dropTable(tableName).execute());
		}

		for (const [tableName, tableDelta] of Object.entries(delta.alter_tables)) {
			using _ = io.start(`Modifying table ${tableName}`);
			const query = tx.schema.alterTable(tableName);

			for (const constraint of tableDelta.drop_constraints) {
				await query.dropConstraint(constraint).execute();
			}

			for (const [oldName, newName] of Object.entries(tableDelta.rename_constraints)) {
				await query.renameConstraint(oldName, newName).execute();
			}

			for (const colName of tableDelta.drop_columns) {
				await query.dropColumn(colName).execute();
			}

			for (const [colName, column] of Object.entries(tableDelta.add_columns)) {
				await query.addColumn(colName, sql.raw(column.type), data.buildColumn(column, false)).execute();
			}

			for (const [oldName, newName] of Object.entries(tableDelta.rename_columns)) {
				await query.renameColumn(oldName, newName).execute();
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

			for (const triggerName of tableDelta.drop_triggers) {
				await io.track(
					'Dropping trigger ' + triggerName,
					sql`DROP TRIGGER ${sql.raw(`"${triggerName}"`)} ON ${sql.raw(`"${tableName}"`)}`.execute(tx)
				);
			}

			for (const [triggerName, trigger] of Object.entries(tableDelta.add_triggers)) {
				let query = `CREATE TRIGGER "${triggerName}" ${trigger.when.toUpperCase()} ${trigger.events.map(e => e.toUpperCase()).join(' OR ')} ON "${tableName}"`;
				if (trigger.from) query += ` FROM "${trigger.from}"`;
				if (trigger.referenceOldAs) query += ` REFERENCING OLD TABLE AS ${trigger.referenceOldAs}`;
				if (trigger.referenceNewAs) query += ` REFERENCING NEW TABLE AS ${trigger.referenceNewAs}`;
				query += ` FOR EACH ${trigger.forEach.toUpperCase()}`;
				query += ` EXECUTE FUNCTION ${trigger.execute}()`;

				await io.track('Creating trigger ' + triggerName, sql.raw(query).execute(tx));
			}

			if (tableDelta.rename_to) await io.track('Renaming table ' + tableName, query.renameTo(tableDelta.rename_to).execute());
		}

		for (const [indexName, index] of Object.entries(delta.add_indexes)) {
			await io.track('Creating index ' + indexName, tx.schema.createIndex(indexName).on(index.on).columns(index.columns).execute());
		}

		for (const index of delta.drop_indexes) {
			await io.track('Dropping index ' + index, tx.schema.dropIndex(index).execute());
		}

		for (const script of delta.scripts.filter(s => s.when === 'after')) {
			using _ = io.start('Running script at ' + script.path);
			const content = readFileSync(script.path, 'utf-8');
			await sql.raw(content).execute(tx);
			io.done();
		}

		if (forceAbort) throw ForceAbort;

		await io.track('Committing', tx.commit().execute());
	} catch (e) {
		await tx.rollback().execute();
		if (e === ForceAbort) return;
		if (e instanceof SuppressedError) io.error(e.suppressed);
		throw e;
	}
}
