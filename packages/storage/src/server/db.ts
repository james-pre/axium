import { getConfig } from '@axium/core';
import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { withError } from '@axium/server/requests';
import { addObjectType as addSyncObjectType } from '@axium/server/sync';
import type {
	AliasedRawBuilder,
	ExpressionBuilder,
	ExpressionOrFactory,
	QueryCreator,
	Selectable,
	SelectQueryBuilder,
	SqlBool,
} from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path/posix';
import type schema from '../../db.json';
import type { StorageItemMetadata, StorageStats } from '../common.js';
import '../polyfills.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

/**
 * @internal A storage item selected from the database.
 */
export interface SelectedItem extends Selectable<Schema['storage']> {}

export interface StorageItem extends StorageItemMetadata {
	data: Uint8Array<ArrayBufferLike>;
}

export function parseItem<T extends SelectedItem>(item: T): Omit<T, keyof Schema['storage']> & StorageItemMetadata {
	return {
		...item,
		dataURL: `/raw/storage/${item.id}`,
		hash: item.hash?.toHex?.(),
	};
}

addSyncObjectType('storage', { parse: parseItem });

/**
 * Returns the current usage of the storage for a user in bytes.
 */
export async function getUserStats(userId: string): Promise<StorageStats> {
	const result = await database
		.selectFrom('storage')
		.where('userId', '=', userId)
		.select(eb => [
			eb.fn.countAll<number>().as('itemCount'),
			eb.fn.countAll<number>().filterWhere('type', '!=', 'inode/directory').as('fileCount'),
			eb.fn.sum('size').as('usedBytes'),
			eb.fn.max('modifiedAt').as('lastModified'),
			eb.fn.max('trashedAt').as('lastTrashed'),
		])
		.executeTakeFirstOrThrow();

	return {
		...result,
		usedBytes: BigInt(result.usedBytes || 0n),
		itemCount: Number(result.itemCount),
	};
}

export async function get(itemId: string): Promise<StorageItemMetadata> {
	const result = await database
		.selectFrom('storage')
		.where('id', '=', itemId)
		.selectAll()
		.$narrowType<{ metadata: any }>()
		.executeTakeFirstOrThrow();
	return parseItem(result);
}

export async function* getRecursive(
	this: { path: string } | void,
	...ids: string[]
): AsyncGenerator<StorageItemMetadata & { path: string }> {
	const items = await database.selectFrom('storage').where('parentId', 'in', ids).selectAll().execute();

	for (const item of items) {
		const path = this?.path ? this.path + '/' + item.name : item.name;
		yield Object.assign(parseItem(item), { path });
		if (item.type == 'inode/directory') yield* getRecursive.call({ path }, item.id);
	}
}

export async function* getRecursiveIds(...ids: string[]): AsyncGenerator<string> {
	const items = await database.selectFrom('storage').where('parentId', 'in', ids).select(['id', 'type']).execute();

	for (const item of items) {
		if (item.type != 'inode/directory') yield item.id;
		else yield* getRecursiveIds(item.id);
	}
}

export async function deleteRecursive(deleteSelf: boolean, ...itemId: string[]): Promise<void> {
	const toDelete = await Array.fromAsync(getRecursiveIds(...itemId)).catch(withError('Could not get items to delete'));

	if (deleteSelf) toDelete.push(...itemId);

	await database.deleteFrom('storage').where('id', '=', itemId).returningAll().execute().catch(withError('Could not delete item'));

	for (const id of toDelete) unlinkSync(join(getConfig('@axium/storage').data, id));
}

export interface ParentFromCTE {
	parentId: string | null;
	name: string;
	id: string;
	depth: number;
	/** Used when the parent query can return multiple rows */
	_baseId: string;
}

export interface DBParentsInsideCTE extends Schema {
	parents: { [k: string]: any };
}

export interface DBWithParentsCTE extends Schema {
	parents: ParentFromCTE;
}

export function parentsCTE(
	filter: ExpressionOrFactory<Schema, 'storage', SqlBool>
): (qb: QueryCreator<DBParentsInsideCTE>) => SelectQueryBuilder<DBWithParentsCTE, 'storage', ParentFromCTE> {
	return (qb: QueryCreator<DBParentsInsideCTE>): SelectQueryBuilder<DBWithParentsCTE, 'storage', ParentFromCTE> =>
		qb
			.selectFrom('storage')
			.select(['id as _baseId', 'id', 'name', 'parentId'])
			.select(eb => eb.lit(0).as('depth'))
			.where(filter)
			.unionAll(
				qb
					.selectFrom('storage as s')
					.innerJoin('parents as p', 's.id', 'p.parentId')
					.select(['p._baseId as _baseId', 's.id', 's.name', 's.parentId'])
					.select(eb => eb(eb.ref('p.depth'), '+', eb.lit(1)).as('depth'))
			);
}

export function withParents(
	eb: ExpressionBuilder<DBWithParentsCTE, 'storage'>
): AliasedRawBuilder<{ name: string; id: string }[], 'parents'> {
	return jsonArrayFrom(
		eb
			.selectFrom('parents')
			.select(['name', 'id'])
			.where('depth', '>', 0)
			.orderBy('depth', 'desc')
			.whereRef('parents._baseId', '=', 'storage.id')
	).as('parents');
}

export async function getParents(itemId: string): Promise<{ id: string; name: string }[]> {
	const rows = await database
		.withRecursive(
			'parents',
			parentsCTE(eb => eb('id', '=', itemId))
		)
		.selectFrom('parents')
		.select(['name', 'id'])
		.where('depth', '>', 0)
		.orderBy('depth', 'desc')
		.execute();

	return rows;
}

export async function getTotalUse(): Promise<bigint> {
	const { size } = await database
		.selectFrom('storage')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return BigInt(size);
}
