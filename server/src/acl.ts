import type { AccessControl, AccessMap, Permission, UserInternal } from '@axium/core';
import type { AliasedRawBuilder, Expression, ExpressionBuilder, Selectable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as db from './database.js';

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

export async function createEntry(itemType: TargetName, data: Omit<AccessControl, 'createdAt'>): Promise<AccessControlInternal> {
	return await db.database.insertInto(`acl.${itemType}`).values(data).returningAll().executeTakeFirstOrThrow();
}

export async function deleteEntry(itemType: TargetName, itemId: string, userId: string): Promise<void> {
	await db.database.deleteFrom(`acl.${itemType}`).where('itemId', '=', itemId).where('userId', '=', userId).execute();
}

export interface ACLSelectionOptions {
	/** If specified, only returns the access control for the given user ID. */
	onlyId?: string | Expression<any>;
	/** Instead of using the `id` from `table`, use the `id` from this instead */
	alias?: string;
}

/**
 * Helper to select all access controls for a given table, including the user information.
 *
 * @param onlyId If specified, only returns the access control for the given user ID.
 */
export function from(
	table: TargetName,
	opt: ACLSelectionOptions = {}
): (eb: ExpressionBuilder<db.Schema, any>) => AliasedRawBuilder<Required<AccessControl>[], 'acl'> {
	return (eb: ExpressionBuilder<db.Schema, any>) =>
		jsonArrayFrom(
			eb
				.selectFrom(`acl.${table} as _acl`)
				.selectAll()
				.select(db.userFromId)
				.whereRef(`_acl.itemId`, '=', `${opt.alias || table}.id` as any)
				.$if(!!opt.onlyId, qb => qb.where('userId', '=', opt.onlyId!))
		)
			.$castTo<Required<AccessControl>[]>()
			.as('acl');
}

export async function get(itemType: TargetName, itemId: string): Promise<Required<AccessControlInternal>[]> {
	return await db.database.selectFrom(`acl.${itemType}`).where('itemId', '=', itemId).selectAll().select(db.userFromId).execute();
}

export async function set(itemType: TargetName, itemId: string, data: AccessMap): Promise<AccessControlInternal[]> {
	if ('public' in data) {
		// @ts-expect-error 2353 - TS misses the column
		await db.database.updateTable(itemType).set({ publicPermission: data.public }).where('id', '=', itemId).execute();
		delete data.public;
	}

	const entries = Object.entries(data).map(([userId, perm]) => ({ userId, perm }));
	if (!entries.length) return [];
	return await db.database
		.updateTable(`acl.${itemType}`)
		.from(db.values(entries, 'data'))
		.set('permission', eb => eb.ref('data.perm'))
		.whereRef(`acl.${itemType}.userId`, '=', 'data.userId')
		.where('itemId', '=', itemId)
		.returningAll()
		.execute();
}
