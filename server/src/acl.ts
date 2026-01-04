import type { AccessControl, AccessMap, UserInternal } from '@axium/core';
import type * as kysely from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { Entries, WithRequired } from 'utilium';
import * as db from './database.js';

type _TableNames = keyof {
	[K in keyof db.Schema as db.Schema[K] extends db.DBAccessControl ? K : never]: null;
};

type _TargetNames = keyof db.Schema &
	keyof {
		[K in _TableNames as K extends `acl.${infer TB extends keyof db.Schema}` ? TB : never]: null;
	};

/**
 * `never` causes a ton of problems, so we use `string` if none of the tables are shareable.
 */
export type TableName = _TableNames extends never ? keyof db.Schema : _TableNames;
export type TargetName = _TargetNames extends never ? keyof db.Schema : _TargetNames;

export interface AccessControlInternal extends AccessControl {
	user?: UserInternal;
	tag?: string | null;
}

export type PermissionsFor<TB extends TableName> = Omit<kysely.Selectable<db.Schema[TB]>, keyof AccessControlInternal | number | symbol>;

export type Result<TB extends TableName> = AccessControlInternal & PermissionsFor<TB>;

export type WithACL<TB extends TargetName> = kysely.Selectable<db.Schema[TB]> & { userId: string; acl: Result<`acl.${TB}`>[] } & Record<
		string,
		any
	>;

export interface ACLSelectionOptions {
	/** If specified, files by user UUID */
	userId?: string | kysely.Expression<any>;

	/** Instead of using the `id` from `table`, use the `id` from this instead */
	alias?: string;
}

/**
 * Helper to select all access controls for a given table, including the user information.
 */
export function from<const TB extends TableName>(
	table: TB,
	opt: ACLSelectionOptions = {}
): (eb: kysely.ExpressionBuilder<db.Schema, any>) => kysely.AliasedRawBuilder<Result<TB>[], 'acl'> {
	return (eb: kysely.ExpressionBuilder<db.Schema, any>) =>
		jsonArrayFrom(
			eb
				.selectFrom(`${table} as _acl`)
				.selectAll()
				.select(db.userFromId)
				.whereRef(`_acl.itemId`, '=', `${opt.alias || table}.id` as any)
				.$if(!!opt.userId, qb =>
					qb.where(eb =>
						eb.or([
							eb('userId', '=', opt.userId!),
							eb('role', 'in', eb.ref('user.roles')),
							eb('tag', 'in', eb.ref('user.tags')),
						])
					)
				)
		)
			.$castTo<Result<TB>[]>()
			.as('acl');
}

export async function get<const TB extends TableName>(
	table: TB,
	itemId: string
): Promise<WithRequired<AccessControlInternal & kysely.Selectable<db.Schema[TB]>, 'user'>[]> {
	// @ts-expect-error 2349
	return await db.database.selectFrom(table).where('itemId', '=', itemId).selectAll().select(db.userFromId).execute();
}

export async function set<const TB extends TableName>(
	table: TB,
	itemId: string,
	data: AccessMap
): Promise<(AccessControlInternal & kysely.Selectable<db.Schema[TB]>)[]> {
	const entries = Object.entries(data).map(([userId, perm]) => ({ userId, ...perm }));
	if (!entries.length) return [];
	return await db.database
		.updateTable(table)
		// @ts-expect-error 2349
		.from(db.values(entries, 'data'))
		.set()
		.whereRef(`${table}.userId`, '=', 'data.userId')
		.where('itemId', '=', itemId)
		.returningAll()
		.execute();
}

export function check<const TB extends TableName>(
	acl: Result<TB>[],
	permissions: Partial<PermissionsFor<TB>>
): Set<keyof PermissionsFor<TB>> {
	const allowed = new Set<keyof PermissionsFor<TB>>();
	const all = new Set(Object.keys(permissions) as (keyof PermissionsFor<TB>)[]);
	const entries = Object.entries(permissions) as Entries<typeof permissions>;

	for (const control of acl) {
		for (const [key, needed] of entries) {
			const value = control[key];
			if (value === needed) allowed.add(key);
		}
	}

	return all.difference(allowed);
}

export function listTables(): Record<string, TableName> {
	const tables: Record<string, TableName> = {};

	for (const [, file] of db.getSchemaFiles()) {
		Object.assign(tables, file.acl_tables || {});
	}

	return tables;
}
