import { fromTarget, type AccessControl, type AccessControllable, type AccessTarget, type UserInternal } from '@axium/core';
import type * as kysely from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { Entries, WithRequired } from 'utilium';
import * as db from './database.js';

type _TableNames = keyof {
	[K in keyof db.Schema as db.Schema[K] extends db.DBAccessControl ? K : never]: null;
};

type _TargetNames = keyof db.Schema &
	keyof {
		[K in keyof db.Schema as db.Schema[K] extends AccessControllable ? (`acl.${K}` extends keyof db.Schema ? K : never) : never]: null;
	};

/**
 * `never` causes a ton of problems, so we use `string` if none of the tables are shareable.
 */
export type TableName = _TableNames extends never ? keyof db.Schema : _TableNames;
export type TargetName = _TargetNames extends never ? keyof db.Schema : _TargetNames;

export interface AccessControlInternal extends AccessControl {}

export type PermissionsFor<TB extends TableName> = Omit<kysely.Selectable<db.Schema[TB]>, keyof AccessControlInternal | number | symbol>;

export type Result<TB extends TableName> = AccessControlInternal & PermissionsFor<TB>;

export type WithACL<TB extends TargetName> = kysely.Selectable<db.Schema[TB]> & { userId: string; acl: Result<`acl.${TB}`>[] };

export interface ACLSelectionOptions {
	/** If specified, filters by user UUID */
	user?: Pick<UserInternal, 'id' | 'roles' | 'tags'>;

	/** Instead of using the `id` from `table`, use the `id` from this instead */
	alias?: string;
}

/**
 * Helper to select all access controls for a given table, including the user information.
 * Optionally filter for the entries applicable to a specific user.
 * This includes entries matching the user's ID, roles, or tags along with the "public" entry where all three "target" columns are null.
 */
export function from<const TB extends TargetName>(
	table: TB,
	opt: ACLSelectionOptions = {}
): (eb: kysely.ExpressionBuilder<db.Schema, any>) => kysely.AliasedRawBuilder<Result<`acl.${TB}`>[], 'acl'> {
	return (eb: kysely.ExpressionBuilder<db.Schema, any>) =>
		jsonArrayFrom(
			eb
				.selectFrom(`acl.${table} as _acl`)
				.selectAll()
				.$if(!opt.user, qb => qb.select(db.userFromId))
				.whereRef('_acl.itemId', '=', `${opt.alias || table}.id` as any)
				.$if(!!opt.user, qb =>
					qb.where(eb => {
						const allNull = eb.and([eb('userId', 'is', null), eb('role', 'is', null), eb('tag', 'is', null)]);

						if (!opt.user) return allNull;

						const ors = [allNull, eb('userId', '=', opt.user.id)];
						if (opt.user.roles.length) ors.push(eb('role', 'in', opt.user.roles));
						if (opt.user.tags.length) ors.push(eb('tag', 'in', opt.user.tags));
						return eb.or(ors);
					})
				)
		)
			.$castTo<Result<`acl.${TB}`>[]>()
			.as('acl');
}

export async function get<const TB extends TableName>(table: TB, itemId: string): Promise<WithRequired<Result<TB>, 'user'>[]> {
	return await db.database
		.selectFrom<TableName>(table)
		.where('itemId', '=', itemId)
		.selectAll()
		.select(db.userFromId)
		.$castTo<WithRequired<AccessControlInternal & kysely.Selectable<db.Schema[TB]>, 'user'>>()
		.execute();
}

export async function update<const TB extends TableName>(
	table: TB,
	itemId: string,
	target: AccessTarget,
	permissions: PermissionsFor<TB>
): Promise<Result<TB>> {
	return await db.database
		.updateTable<TableName>(table)
		.set(permissions)
		.where('itemId', '=', itemId)
		.where(eb => eb.and(fromTarget(target)))
		.returningAll()
		.$castTo<AccessControlInternal & kysely.Selectable<db.Schema[TB]>>()
		.executeTakeFirstOrThrow();
}

export async function remove<const TB extends TableName>(table: TB, itemId: string, target: AccessTarget): Promise<Result<TB>> {
	return await db.database
		.deleteFrom<TableName>(table)
		.where('itemId', '=', itemId)
		.where(eb => eb.and(fromTarget(target)))
		.returningAll()
		.$castTo<AccessControlInternal & kysely.Selectable<db.Schema[TB]>>()
		.executeTakeFirstOrThrow();
}

export async function add<const TB extends TableName>(table: TB, itemId: string, target: AccessTarget): Promise<Result<TB>> {
	return await db.database
		.insertInto<TableName>(table)
		.values({ itemId, ...fromTarget(target) })
		.returningAll()
		.$castTo<AccessControlInternal & kysely.Selectable<db.Schema[TB]>>()
		.executeTakeFirstOrThrow();
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

	for (const [, file] of db.schema.getFiles()) {
		Object.assign(tables, file.acl_tables || {});
	}

	return tables;
}

export interface OptionsForWhere<TB extends TargetName> {
	itemId?: keyof db.Schema[TB] & string;
	/** Alias for the item table/value */
	alias?: string;
}

/**
 * Use in a `where` to filter by items a user can access because of an ACL entry.
 *
 */
export function existsIn<const TB extends TargetName, const O extends OptionsForWhere<TB>>(
	table: TB,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: O = {} as any
) {
	type DB = db.Schema & { [K in O['alias'] extends string ? O['alias'] : never]: db.Schema[TB] };
	type EB = kysely.ExpressionBuilder<DB, O['alias'] extends string ? O['alias'] & keyof DB : TB>;

	return (eb: EB) =>
		eb.exists(
			eb
				.selectFrom<TableName>(`acl.${table}`)
				// @ts-expect-error 2349
				.whereRef('itemId', '=', `${options.alias || `public.${table}`}.${options.itemId || 'id'}`)
				.where((eb: kysely.ExpressionBuilder<db.Schema, TableName>) => {
					const ors = [eb('userId', '=', user.id)];
					if (user.roles.length) ors.push(eb('role', 'in', user.roles));
					if (user.tags.length) ors.push(eb('tag', 'in', user.tags));
					return eb.or(ors);
				})
		);
}

/**
 * Use in a `where` to filter by items a user has access to
 */
export function userHasAccess<const TB extends TargetName>(
	table: TB,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: OptionsForWhere<TB> = {}
) {
	return (eb: kysely.ExpressionBuilder<db.Schema, TB>) => eb.or([eb('userId', '=', user.id as any), existsIn(table, user, options)(eb)]);
}
