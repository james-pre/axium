import { getConfig } from '@axium/core';
import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { withError } from '@axium/server/requests';
import type { Selectable } from 'kysely';
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

/**
 * Returns the current usage of the storage for a user in bytes.
 */
export async function getUserStats(userId: string): Promise<StorageStats> {
	const result = await database
		.selectFrom('storage')
		.where('userId', '=', userId)
		.select(eb => [
			eb.fn.countAll<number>().as('itemCount'),
			eb.fn.sum<number>('size').as('usedBytes'),
			eb.fn.max('modifiedAt').as('lastModified'),
			eb.fn.max('trashedAt').as('lastTrashed'),
		])
		.executeTakeFirstOrThrow();

	result.usedBytes = Number(result.usedBytes || 0);
	result.itemCount = Number(result.itemCount);

	return result;
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

export async function getParents(itemId: string): Promise<{ id: string; name: string }[]> {
	const rows = await database
		.withRecursive('parents', qb =>
			qb
				.selectFrom('storage')
				.select(['id', 'name', 'parentId'])
				.select(eb => eb.lit(0).as('depth'))
				.where('id', '=', itemId)
				.unionAll(
					qb
						.selectFrom('storage as s')
						.innerJoin('parents as p', 's.id', 'p.parentId')
						.select(['s.id', 's.name', 's.parentId'])
						.select(eb => eb(eb.ref('p.depth'), '+', eb.lit(1)).as('depth'))
				)
		)
		.selectFrom('parents')
		.select(['name', 'id'])
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
