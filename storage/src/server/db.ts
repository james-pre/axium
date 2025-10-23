import { config } from '@axium/server/config';
import { database, expectedTypes, type Schema } from '@axium/server/database';
import { withError } from '@axium/server/requests';
import type { Generated, Selectable } from 'kysely';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path/posix';
import type { StorageItemMetadata, StorageUsage } from '../common.js';
import '../polyfills.js';

declare module '@axium/server/database' {
	export interface Schema {
		storage: {
			createdAt: Generated<Date>;
			hash: Uint8Array | null;
			id: Generated<string>;
			immutable: Generated<boolean>;
			modifiedAt: Generated<Date>;
			name: string;
			parentId: string | null;
			size: number;
			trashedAt: Date | null;
			type: string;
			userId: string;
			publicPermission: Generated<number>;
			metadata: Generated<Record<string, unknown>>;
		};
	}

	export interface ExpectedSchema {
		storage: ColumnTypes<Schema['storage']>;
	}
}

/**
 * @internal A storage item selected from the database.
 */
export interface SelectedItem extends Selectable<Schema['storage']> {}

expectedTypes.storage = {
	createdAt: { type: 'timestamptz', required: true, hasDefault: true },
	hash: { type: 'bytea' },
	id: { type: 'uuid', required: true, hasDefault: true },
	immutable: { type: 'bool', required: true },
	modifiedAt: { type: 'timestamptz', required: true, hasDefault: true },
	name: { type: 'text' },
	parentId: { type: 'uuid' },
	size: { type: 'int4', required: true },
	trashedAt: { type: 'timestamptz' },
	type: { type: 'text', required: true },
	userId: { type: 'uuid', required: true },
	publicPermission: { type: 'int4', required: true, hasDefault: true },
	metadata: { type: 'jsonb', required: true, hasDefault: true },
};

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
export async function currentUsage(userId: string): Promise<StorageUsage> {
	const result = await database
		.selectFrom('storage')
		.where('userId', '=', userId)
		.select(eb => eb.fn.countAll<number>().as('items'))
		.select(eb => eb.fn.sum<number>('size').as('bytes'))
		.executeTakeFirstOrThrow();

	result.bytes = Number(result.bytes || 0);
	result.items = Number(result.items);

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

	for (const id of toDelete) unlinkSync(join(config.storage.data, id));
}
