import type { AccessControl, AccessControlConfig, AccessControllable, AccessTarget, UserInternal } from '@axium/core';
import { fromTarget, resolvePermissions } from '@axium/core/access';
import { getAccessControlConfig } from '@axium/core/plugins';
import type * as kysely from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { WithRequired } from 'utilium';
import * as db from './db/index.js';

export interface DBAccessControllable extends Omit<AccessControllable, 'id'> {
	id: string | kysely.Generated<string>;
}

type _TableNames = keyof {
	[K in keyof db.Schema as db.Schema[K] extends db.DBAccessControl ? K : never]: null;
};

type _TargetNames = keyof db.Schema &
	keyof {
		[
			K in keyof db.Schema as db.Schema[K] extends DBAccessControllable ? (`acl.${K}` extends keyof db.Schema ? K : never) : never
		]: null;
	};

/**
 * `never` causes a ton of problems, so we use `keyof db.Schema` if none of the tables are shareable.
 */
export type TableName = _TableNames extends never ? keyof db.Schema : _TableNames;
export type TargetName = _TargetNames extends never ? keyof db.Schema : _TargetNames;

export type PermissionsFor<TB extends TableName> = Omit<kysely.Selectable<db.Schema[TB]>, keyof AccessControl | number | symbol>;

export type Result<TB extends TableName> = AccessControl & PermissionsFor<TB>;

export type WithACL<TB extends TargetName> = kysely.Selectable<db.Schema[TB]> & {
	userId: string;
	parentId?: string | null;
	acl: Result<`acl.${TB}`>[];
};

/** Match ACL entries, optionally selecting for a given user-like object */
export function match(user?: Pick<UserInternal, 'id' | 'roles' | 'tags'>) {
	return function (eb: kysely.ExpressionBuilder<db.Schema, any>) {
		const allNull = eb.and([eb('userId', 'is', null), eb('role', 'is', null), eb('tag', 'is', null)]);

		if (!user) return allNull;

		const ors = [allNull, eb('userId', '=', user.id)];
		if (user.roles.length) ors.push(eb('role', 'in', user.roles));
		if (user.tags.length) ors.push(eb('tag', 'in', user.tags));
		return eb.or(ors);
	};
}

export interface ACLSelectionOptions<A = string> {
	/** Instead of using the `id` from `table`, use the `id` from this instead */
	alias?: A;

	/** If set, only ACLs that match the provided info will be selected. */
	filterByUser?: Pick<UserInternal, 'id' | 'roles' | 'tags'>;

	/** If set, nothing will be returned when an ACL table doesn't exist (rather than throwing) */
	optional?: boolean;
}

/**
 * Helper to select all access controls for a given table, including the user information.
 * Optionally filter for the entries applicable to a specific user.
 * This includes entries matching the user's ID, roles, or tags along with the "public" entry where all three "target" columns are null.
 */
export function from<
	const TB extends TargetName,
	const A extends string = TB,
	const DB extends db.Schema & { [K in A]: DBAccessControllable } = db.Schema & { [K in A]: db.Schema[TB] },
>(
	table: TB,
	opt: ACLSelectionOptions<A> = {}
): (eb: kysely.ExpressionBuilder<DB, A>) => kysely.AliasedRawBuilder<Result<`acl.${TB}`>[], 'acl'> {
	// Note this is valid to pass to `.select()` however including it as a return type is problematic
	if (opt.optional && !getAccessControlConfig(table)) return [] as any;

	return (eb: kysely.ExpressionBuilder<DB, A>) =>
		jsonArrayFrom(
			(eb as kysely.ExpressionBuilder<db.Schema, any>)
				.selectFrom(`acl.${table} as _acl`)
				.selectAll()
				.select(db.userFromId)
				.whereRef('_acl.itemId', '=', `${opt.alias || table}.id` as any)
				.$if(!!opt.filterByUser, qb => qb.where(match(opt.filterByUser)))
		)
			.$castTo<Result<`acl.${TB}`>[]>()
			.as('acl');
}

/**
 * @throws if the item type does not support access controls
 */
export function getConfig(itemType: string): AccessControlConfig {
	const config = getAccessControlConfig(itemType);
	if (!config) throw new Error('Item type does not support access controls: ' + itemType);
	return config;
}

export async function get<const TB extends TargetName>(itemType: TB, itemId: string): Promise<WithRequired<Result<`acl.${TB}`>, 'user'>[]> {
	return await db.database
		.selectFrom(`acl.${itemType}` as TableName)
		.where('itemId', '=', itemId)
		.selectAll()
		.select(db.userFromId)
		.$castTo<WithRequired<AccessControl & kysely.Selectable<db.Schema[`acl.${TB}`]>, 'user'>>()
		.execute();
}

/**
 * Change the permissions of an access control, including the permissions they imply.
 * @throws if the permissions are unknown or conflict
 */
export async function update<const TB extends TargetName>(
	itemType: TB,
	itemId: string,
	target: AccessTarget,
	permissions: Record<string, boolean>
): Promise<Result<`acl.${TB}`>> {
	const changes = resolvePermissions(getConfig(itemType), permissions);
	if (!Object.keys(changes).length) throw new Error('No permissions to change');

	return await db.database
		.updateTable(`acl.${itemType}` as TableName)
		.set(changes)
		.where('itemId', '=', itemId)
		.where(eb => eb.and(fromTarget(target)))
		.returningAll()
		.$castTo<AccessControl & kysely.Selectable<db.Schema[`acl.${TB}`]>>()
		.executeTakeFirstOrThrow();
}

export async function remove<const TB extends TargetName>(
	itemType: TB,
	itemId: string,
	target: AccessTarget
): Promise<Result<`acl.${TB}`>> {
	return await db.database
		.deleteFrom(`acl.${itemType}` as TableName)
		.where('itemId', '=', itemId)
		.where(eb => eb.and(fromTarget(target)))
		.returningAll()
		.$castTo<AccessControl & kysely.Selectable<db.Schema[`acl.${TB}`]>>()
		.executeTakeFirstOrThrow();
}

/**
 * Add an access control. Permissions not given use the defaults for the item type.
 * @throws if the permissions are unknown or conflict
 */
export async function add<const TB extends TargetName>(
	itemType: TB,
	itemId: string,
	target: AccessTarget,
	permissions: Record<string, boolean> = {}
): Promise<Result<`acl.${TB}`>> {
	const changes = resolvePermissions(getConfig(itemType), permissions);

	return await db.database
		.insertInto(`acl.${itemType}` as TableName)
		.values({ itemId, ...fromTarget(target), ...changes })
		.returningAll()
		.$castTo<AccessControl & kysely.Selectable<db.Schema[`acl.${TB}`]>>()
		.executeTakeFirstOrThrow();
}

export interface ItemLink {
	name: string;
	url: string;
}

function fill(template: string, item: Record<string, unknown>, encode: (value: string) => string = value => value): string {
	return template.replaceAll(/\{(\w+)\}/g, (placeholder, key: string) => {
		const value = item[key];
		return typeof value == 'string' || typeof value == 'number' ? encode(String(value)) : '';
	});
}

/**
 * Get the name and URL used when notifying users about an item, if notifications are enabled for the item type.
 */
export function linkTo<const TB extends TargetName>(itemType: TB, item: kysely.Selectable<db.Schema[TB]>): ItemLink | undefined {
	const { notifications } = getConfig(itemType);
	if (!notifications?.enabled) return;

	return {
		name: fill(notifications.name, item),
		url: fill(notifications.url, item, encodeURIComponent),
	};
}

export interface OptionsForWhere<TB extends TargetName> {
	itemId?: keyof db.Schema[TB] & string;
	/** Alias for the item table/value */
	alias?: string;
	/** If set, nothing will be returned when an ACL table doesn't exist (rather than throwing) */
	optional?: boolean;
}

type _DB<TB extends TargetName, O extends OptionsForWhere<TB>> = db.Schema & {
	[K in O['alias'] extends string ? O['alias'] : never]: db.Schema[TB];
};

export interface FilterExpression<TB extends TargetName, O extends OptionsForWhere<TB>> extends kysely.ExpressionBuilder<
	_DB<TB, O>,
	O['alias'] extends string ? O['alias'] & keyof _DB<TB, O> : TB
> {}

export type FilterCallback<TB extends TargetName, O extends OptionsForWhere<TB>> = (
	eb: FilterExpression<TB, O>
) => kysely.ExpressionWrapper<_DB<TB, O>, O['alias'] extends string ? O['alias'] & keyof _DB<TB, O> : TB, kysely.SqlBool>;

/**
 * Use in a `where` to filter by items a user can access because of an ACL entry.
 */
export function existsIn<const TB extends TargetName, const O extends OptionsForWhere<TB>>(
	table: TB,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: O = {} as any
): FilterCallback<TB, O> {
	if (options.optional && !getAccessControlConfig(table)) return eb => eb.val(false);

	return eb =>
		eb.exists(
			eb
				.selectFrom<TableName>(`acl.${table}`)
				// @ts-expect-error 2349
				.whereRef('itemId', '=', `${options.alias || `public.${table}`}.${options.itemId || 'id'}`)
				.where(match(user))
		);
}

/**
 * Use in a `where` to filter by items a user has access to
 */
export function userHasAccess<const TB extends TargetName, const O extends OptionsForWhere<TB>>(
	table: TB,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: O = {} as any
): FilterCallback<TB, O> {
	return eb => eb.or([eb('userId', '=', user.id as any), existsIn(table, user, options)(eb)]);
}
