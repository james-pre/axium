import type { AccessControl, Permission } from '@axium/core';
import type { Expression, ExpressionBuilder } from 'kysely';
import { sql, type Selectable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { UserInternal } from './auth.js';
import * as db from './database.js';
import * as io from './io.js';

export interface Target {
	userId: string;
	publicPermission: Permission;
}

type _TableNames = (string & keyof db.Schema) &
	keyof {
		[K in Exclude<keyof db.Schema, `acl.${string}`> as Selectable<db.Schema[K]> extends Omit<Target, 'acl'> ? K : never]: null;
	};

/**
 * `never` causes a ton of problems, so we use `string` if none of the tables are shareable.
 */
export type TargetName = _TableNames extends never ? keyof db.Schema : _TableNames;

export interface AccessControlInternal extends AccessControl {
	user?: UserInternal;
}

const accessControllableTypes = {
	userId: { type: 'uuid' },
	publicPermission: { type: 'int4' },
} satisfies db.ColumnTypes<Target>;

export const expectedTypes = {
	userId: { type: 'uuid', required: true },
	createdAt: { type: 'timestamptz', required: true, hasDefault: true },
	itemId: { type: 'uuid', required: true },
	permission: { type: 'int4', required: true, hasDefault: true },
} satisfies db.ColumnTypes<db.Schema[`acl.${TargetName}`]>;

/**
 * Adds an Access Control List (ACL) in the database for managing access to rows in an existing table.
 * @category Plugin API
 */
export async function createTable(table: TargetName) {
	await db.checkTableTypes(table, accessControllableTypes, { strict: true, extra: false });

	io.start(`Creating table acl.${table}`);
	await db.database.schema
		.createTable(`acl.${table}`)
		.addColumn('userId', 'uuid', col => col.references('users.id').onDelete('cascade'))
		.addColumn('itemId', 'uuid', col => col.references(`${table}.id`).onDelete('cascade'))
		.addPrimaryKeyConstraint('PK_acl_' + table, ['userId', 'itemId'])
		.addColumn('createdAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('permission', 'integer', col => col.notNull().check(sql`permission >= 0 AND permission <= 5`))
		.execute()
		.then(io.done)
		.catch(db.warnExists);

	await db.createIndex(`acl.${table}`, 'userId');
	await db.createIndex(`acl.${table}`, 'itemId');
}

export async function dropTable(table: TargetName) {
	io.start(`Dropping table acl.${table}`);
	await db.database.schema.dropTable(`acl.${table}`).execute().then(io.done).catch(db.warnExists);
}

export async function wipeTable(table: TargetName) {
	io.start(`Wiping table acl.${table}`);
	await db.database.deleteFrom(`acl.${table}`).execute().then(io.done).catch(db.warnExists);
}

export async function createEntry(itemType: TargetName, data: Omit<AccessControl, 'createdAt'>): Promise<AccessControlInternal> {
	return await db.database.insertInto(`acl.${itemType}`).values(data).returningAll().executeTakeFirstOrThrow();
}

export async function deleteEntry(itemType: TargetName, itemId: string, userId: string): Promise<void> {
	await db.database.deleteFrom(`acl.${itemType}`).where('itemId', '=', itemId).where('userId', '=', userId).execute();
}

/**
 * Helper to select all access controls for a given table, including the user information.
 * @param onlyId If specified, only returns the access control for the given user ID.
 */
export function from(table: TargetName, onlyId?: string | Expression<any>) {
	return (eb: ExpressionBuilder<db.Schema, any>) =>
		jsonArrayFrom(
			eb
				.selectFrom(`acl.${table} as _acl`)
				.selectAll()
				.select(db.userFromId)
				.whereRef(`_acl.itemId`, '=', `${table}.id` as any)
				.$if(!!onlyId, qb => qb.where('userId', '=', onlyId!))
		)
			.$castTo<Required<AccessControl>[]>()
			.as('acl');
}

export async function get(itemType: TargetName, itemId: string): Promise<Required<AccessControlInternal>[]> {
	return await db.database.selectFrom(`acl.${itemType}`).where('itemId', '=', itemId).selectAll().select(db.userFromId).execute();
}
