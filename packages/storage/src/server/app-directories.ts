import { getConfig } from '@axium/core';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import type { UploadChunkFinal } from '@axium/server/uploads';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import type { StorageItemInit, StorageItemMetadata } from '../common.js';
import { streamRead } from '../node.js';
import '../polyfills.js';
import { deleteRecursive, getParents, parseItem } from './db.js';
import { checkLimits, createNewItem } from './item.js';

export interface AppDirectory {
	plugin: string;
	userId: string;
	key: string[];
	createdAt: Date;
	item: StorageItemMetadata;
}

/**
 * Get a plugin's directory for a user and key without creating it.
 */
export async function find(plugin: string, userId: string, ...key: readonly string[]): Promise<StorageItemMetadata | undefined> {
	const item = await database
		.selectFrom('storage_app_directories as directory')
		.innerJoin('storage', 'storage.id', 'directory.itemId')
		.selectAll('storage')
		.where('directory.plugin', '=', plugin)
		.where('directory.userId', '=', userId)
		.where('directory.key', '=', [...key])
		.executeTakeFirst()
		.catch(withError('Could not get app directory'));

	return item && parseItem(item);
}

/**
 * Get a plugin's directory for a user and key, creating it if it does not exist.
 * The same plugin, user, and key always resolve to the same directory.
 */
export async function get(plugin: string, userId: string, ...key: readonly string[]): Promise<StorageItemMetadata> {
	const existing = await find(plugin, userId, ...key);
	if (existing) return existing;

	const tx = await database.startTransaction().execute();

	let created;
	try {
		const item = await tx
			.insertInto('storage')
			.values({ name: plugin, type: 'inode/directory', size: 0n, immutable: false, userId, plugin })
			.returningAll()
			.executeTakeFirstOrThrow();

		const { numInsertedOrUpdatedRows } = await tx
			.insertInto('storage_app_directories')
			.values({ plugin, userId, key: [...key], itemId: item.id })
			.onConflict(oc => oc.columns(['plugin', 'userId', 'key']).doNothing())
			.executeTakeFirstOrThrow();

		if (numInsertedOrUpdatedRows) created = item;
	} catch (e: any) {
		await tx.rollback().execute();
		throw withError('Could not create app directory', 500)(e);
	}

	if (!created) {
		await tx.rollback().execute();
		return (await find(plugin, userId, ...key)) ?? error(500, 'App directory was created and removed concurrently');
	}

	await tx.commit().execute();
	return parseItem(created);
}

/**
 * List a plugin's directories, optionally only those for one user.
 */
export async function list(plugin: string, userId?: string): Promise<AppDirectory[]> {
	const directories = await database
		.selectFrom('storage_app_directories')
		.selectAll()
		.where('plugin', '=', plugin)
		.$if(!!userId, qb => qb.where('userId', '=', userId!))
		.execute()
		.catch(withError('Could not get app directories'));

	if (!directories.length) return [];

	const items = await database
		.selectFrom('storage')
		.selectAll()
		.where(
			'id',
			'in',
			directories.map(directory => directory.itemId)
		)
		.execute()
		.catch(withError('Could not get app directory items'));

	const itemsById = new Map(items.map(item => [item.id, parseItem(item)]));

	return directories.map(({ itemId, ...directory }) => ({ ...directory, item: itemsById.get(itemId)! }));
}

/**
 * Permanently delete a plugin's directory for a user and key, along with its contents.
 */
export async function remove(plugin: string, userId: string, ...key: readonly string[]): Promise<StorageItemMetadata | undefined> {
	const item = await find(plugin, userId, ...key);
	if (!item) return;

	await deleteRecursive(false, item.id);
	return item;
}

/**
 * Permanently delete all of a plugin's directories along with their contents.
 * @returns the number of directories deleted
 */
export async function removeAll(plugin: string): Promise<number> {
	const directories = await database
		.selectFrom('storage_app_directories')
		.select('itemId')
		.where('plugin', '=', plugin)
		.execute()
		.catch(withError('Could not get app directories'));

	if (directories.length) await deleteRecursive(false, ...directories.map(directory => directory.itemId));

	return directories.length;
}

/**
 * Get an item inside one of a plugin's directories, or one of the directories themselves.
 */
export async function getItem(plugin: string, itemId: string): Promise<StorageItemMetadata> {
	const item = await database
		.selectFrom('storage')
		.selectAll()
		.where('id', '=', itemId)
		.where('plugin', '=', plugin)
		.executeTakeFirst()
		.catch(withError('Could not get item'));

	return item ? parseItem(item) : error(404, 'Not found');
}

/**
 * List the items directly inside a directory belonging to a plugin.
 */
export async function contents(plugin: string, directoryId: string): Promise<StorageItemMetadata[]> {
	const items = await database
		.selectFrom('storage')
		.selectAll()
		.where('parentId', '=', directoryId)
		.where('plugin', '=', plugin)
		.execute()
		.catch(withError('Could not get directory contents'));

	return items.map(parseItem);
}

export interface AppItemInit extends StorageItemInit {
	parentId: string;
}

/**
 * Throws if an item can not be created in a plugin's directory.
 * @returns the directory the item would be created in
 */
export async function checkItem(plugin: string, init: AppItemInit): Promise<StorageItemMetadata> {
	const parent = await getItem(plugin, init.parentId);

	if (parent.type != 'inode/directory') error(409, 'Items can only be created in folders');
	if (init.type == 'inode/directory' && init.size > 0) error(400, 'Directories can not have content');

	await checkLimits(parent.userId, init.size);

	const conflict = await database
		.selectFrom('storage')
		.select('id')
		.where('parentId', '=', parent.id)
		.where('name', '=', init.name)
		.executeTakeFirst()
		.catch(withError('Could not check for existing items'));

	if (conflict) error(409, 'An item with that name already exists in this folder.');

	return parent;
}

/** File content, either in memory or from a finished upload. */
export type AppItemContent = Uint8Array | Pick<UploadChunkFinal<any, any>, 'hash' | 'writeTo'>;

/**
 * Create an item in a plugin's directory, owned by the directory's owner.
 * `content` is required for files; for in-memory content, `init.size` and `init.hash` are computed from it.
 */
export async function createItem(plugin: string, init: AppItemInit, content?: AppItemContent): Promise<StorageItemMetadata> {
	if (init.type == 'inode/directory') {
		const parent = await checkItem(plugin, { ...init, size: 0n, hash: null });
		return await createNewItem({ ...init, size: 0n, hash: null, plugin }, parent.userId);
	}

	if (!content) error(400, 'Files must have content');

	if (content instanceof Uint8Array) {
		const fileInit = { ...init, size: BigInt(content.byteLength), hash: createHash('BLAKE2b512').update(content).digest().toHex() };
		const parent = await checkItem(plugin, fileInit);
		return await createNewItem({ ...fileInit, plugin }, parent.userId, path => writeFileSync(path, content));
	}

	const parent = await checkItem(plugin, init);
	return await createNewItem({ ...init, hash: content.hash.toHex(), plugin }, parent.userId, content.writeTo);
}

/**
 * Stream the content of a file belonging to a plugin.
 * @param start inclusive byte offset
 * @param end inclusive byte offset
 */
export async function read(plugin: string, itemId: string, start?: number, end?: number): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
	const item = await getItem(plugin, itemId);
	if (item.type == 'inode/directory') error(409, 'Directories do not have content');

	return streamRead(join(getConfig('@axium/storage').data, item.id), start, end);
}

/**
 * Permanently delete an item belonging to a plugin, along with its contents.
 */
export async function deleteItem(plugin: string, itemId: string): Promise<StorageItemMetadata> {
	const item = await getItem(plugin, itemId);
	await deleteRecursive(item.type != 'inode/directory', itemId);
	return item;
}

/**
 * Move an item belonging to a plugin into another of its directories.
 * Files moved between directories with different owners change owner.
 */
export async function moveItem(plugin: string, itemId: string, parentId: string): Promise<StorageItemMetadata> {
	if (itemId == parentId) error(400, 'An item can not be moved into itself');

	const [item, parent] = await Promise.all([getItem(plugin, itemId), getItem(plugin, parentId)]);

	if (parent.type != 'inode/directory') error(400, 'Items can only be moved into folders');
	if (!item.parentId) error(400, 'App directories can not be moved');

	if (item.type == 'inode/directory') {
		if (parent.userId != item.userId) error(409, 'Folders can not be moved to a different owner');

		for (const ancestor of await getParents(parentId))
			if (ancestor.id == itemId) error(400, 'An item can not be moved into its own descendant');
	}

	if (parent.userId != item.userId) await checkLimits(parent.userId, item.size);

	return await database
		.updateTable('storage')
		.where('id', '=', itemId)
		.set({ parentId, userId: parent.userId })
		.returningAll()
		.executeTakeFirstOrThrow()
		.then(parseItem)
		.catch(e => {
			if (e instanceof Error && e.message.includes('unique_name_parentId'))
				error(409, 'An item with that name already exists in this folder.');
			throw withError('Could not move item')(e);
		});
}
