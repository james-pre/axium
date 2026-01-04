import type { AsyncResult, Result, UserInternal } from '@axium/core';
import { checkAuthForItem, checkAuthForUser } from '@axium/server/auth';
import { config } from '@axium/server/config';
import { database, type Schema } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { ExpressionBuilder } from 'kysely';
import { pick } from 'utilium';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import { batchFormatVersion, StorageItemUpdate, syncProtocolVersion } from '../common.js';
import '../polyfills.js';
import { getLimits } from './config.js';
import { deleteRecursive, getRecursive, getUserStats, parseItem } from './db.js';

addRoute({
	path: '/api/storage',
	OPTIONS(): Result<'OPTIONS', 'storage'> {
		return {
			...pick(config.storage, 'batch', 'chunk', 'max_chunks', 'max_transfer_size'),
			syncProtocolVersion,
			batchFormatVersion,
		};
	},
});

addRoute({
	path: '/api/storage/item/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { item } = await checkAuthForItem(request, 'storage', itemId, { read: true });

		return parseItem(item);
	},
	async PATCH(request, { id: itemId }): AsyncResult<'PATCH', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const body = await parseBody(request, StorageItemUpdate);

		await checkAuthForItem(request, 'storage', itemId, { manage: true });

		const values: Partial<Pick<StorageItemMetadata, 'trashedAt' | 'userId' | 'name'>> = {};
		if ('trash' in body) values.trashedAt = body.trash ? new Date() : null;
		if ('owner' in body) values.userId = body.owner;
		if ('name' in body) values.name = body.name;

		if (!Object.keys(values).length) error(400, 'No valid fields to update');

		return parseItem(
			await database
				.updateTable('storage')
				.where('id', '=', itemId)
				.set(values)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update item'))
		);
	},
	async DELETE(request, { id: itemId }): AsyncResult<'DELETE', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const auth = await checkAuthForItem(request, 'storage', itemId, { manage: true });
		const item = parseItem(auth.item);

		await deleteRecursive(item.type != 'inode/directory', itemId);

		return item;
	},
});

addRoute({
	path: '/api/storage/directory/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { item } = await checkAuthForItem(request, 'storage', itemId, { read: true });

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await database
			.selectFrom('storage')
			.where('parentId', '=', itemId)
			.where('trashedAt', 'is', null)
			.selectAll()
			.execute();

		return items.map(parseItem);
	},
});

addRoute({
	path: '/api/storage/directory/:id/recursive',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id/recursive'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { item } = await checkAuthForItem(request, 'storage', itemId, { read: true });

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await Array.fromAsync(getRecursive(itemId)).catch(withError('Could not get some directory items'));
		return items;
	},
});

addRoute({
	path: '/api/users/:id/storage',
	params: { id: z.uuid() },
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const [stats, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(withError('Could not fetch data'));

		return Object.assign(stats, { limits });
	},
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const [items, stats, limits] = await Promise.all([
			database.selectFrom('storage').where('userId', '=', userId).where('trashedAt', 'is', null).selectAll().execute(),
			getUserStats(userId),
			getLimits(userId),
		]).catch(withError('Could not fetch data'));

		return Object.assign(stats, { limits, items: items.map(parseItem) });
	},
});

addRoute({
	path: '/api/users/:id/storage/root',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/root'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage')
			.where('userId', '=', userId)
			.where('trashedAt', 'is', null)
			.where('parentId', 'is', null)
			.selectAll()
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

function existsInACL(column: 'id' | 'parentId', user: Pick<UserInternal, 'id' | 'roles' | 'tags'>) {
	return (eb: ExpressionBuilder<Schema & { item: Schema['storage'] }, 'item'>) =>
		eb.exists(
			eb
				.selectFrom('acl.storage')
				.whereRef('itemId', '=', `item.${column}`)
				.where('userId', '=', user.id)
				.where(eb => eb.or([eb('userId', '=', user.id), eb('role', 'in', user.roles), eb('tag', 'in', user.tags)]))
		);
}

addRoute({
	path: '/api/users/:id/storage/shared',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/shared'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { user } = await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage as item')
			.selectAll('item')
			.where('trashedAt', 'is', null)
			.where(existsInACL('id', user))
			.where(eb => eb.not(existsInACL('parentId', user)))
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

addRoute({
	path: '/api/users/:id/storage/trash',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/trash'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage')
			.where('userId', '=', userId)
			.where('trashedAt', 'is not', null)
			.selectAll()
			.execute()
			.catch(withError('Could not get trash'));

		return items.map(parseItem);
	},
});
