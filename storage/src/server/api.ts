import type { AsyncResult, Result } from '@axium/core';
import * as acl from '@axium/server/acl';
import { authRequestForItem, checkAuthForUser, requireSession } from '@axium/server/auth';
import type { Schema as DBSchema } from '@axium/server/database';
import { database } from '@axium/server/database';
import { error, json, parseBody, parseSearch, withError } from '@axium/server/requests';
import { pick } from 'utilium';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import {
	batchFormatVersion,
	GetItemOptions,
	StorageItemInit,
	StorageItemSize,
	StorageItemUpdate,
	syncProtocolVersion,
	UserStorageOptions,
} from '../common.js';
import '../polyfills.js';
import storage from './bind.js';
import { getLimits } from './config.js';
import { deleteRecursive, getParents, getRecursive, getUserStats, parseItem } from './db.js';
import { checkItemUpdate, checkNewItem, createNewItem, startUpload } from './item.js';

storage.addRoute({
	path: '/api/storage',
	OPTIONS(): Result<'OPTIONS', 'storage'> {
		return {
			...pick(storage.getConfig(), 'batch', 'max_transfer_size'),
			syncProtocolVersion,
			batchFormatVersion,
		};
	},
	async PUT(request): Promise<Response> {
		type R = Result<'PUT', 'storage'>;

		const session = await requireSession(request);

		const init = await parseBody(request, StorageItemInit);
		const { existing } = await checkNewItem(init, session);

		if (existing || init.type == 'inode/directory') {
			const item = await createNewItem(init, session.userId);
			return json({ status: 'created', item } satisfies R, { status: 201 });
		}

		return json(
			{
				...pick(storage.getConfig(), 'batch', 'max_transfer_size'),
				status: 'accepted',
				token: startUpload(init, session, null),
			} satisfies R,
			{ status: 202 }
		);
	},
});

storage.addRoute({
	path: '/api/storage/item/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/item/:id'> {
		const options = parseSearch(request, GetItemOptions);

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		const result = parseItem(item);

		if (options.parents) result.parents = await getParents(itemId);

		return result;
	},
	async PATCH(request, { id: itemId }): AsyncResult<'PATCH', 'storage/item/:id'> {
		const body = await parseBody(request, StorageItemUpdate);

		await authRequestForItem(request, 'storage', itemId, { manage: true }, true);

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
	async POST(request, { id: itemId }): Promise<Response> {
		type R = Result<'POST', 'storage/item/:id'>;

		const { enabled, ...rest } = storage.getConfig();

		if (!enabled) error(503, 'User storage is disabled');

		const size = await parseBody(request, StorageItemSize);

		const { item, session } = await checkItemUpdate(request, itemId);

		if (!session) error(401, 'You must be logged in to change file contents');

		return json(
			{
				...pick(rest, 'batch', 'max_transfer_size'),
				status: 'accepted',
				token: startUpload({ ...item, size }, session, itemId),
			} satisfies R,
			{ status: 202 }
		);
	},
	async DELETE(request, { id: itemId }): AsyncResult<'DELETE', 'storage/item/:id'> {
		const auth = await authRequestForItem(request, 'storage', itemId, { manage: true }, true);
		const item = parseItem(auth.item);

		await deleteRecursive(item.type != 'inode/directory', itemId);

		return item;
	},
});

storage.addRoute({
	path: '/api/storage/directory/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id'> {
		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await database
			.selectFrom('storage')
			.select(acl.from('storage'))
			.where('parentId', '=', itemId)
			.where('trashedAt', 'is', null)
			.selectAll()
			.execute();

		return items.map(parseItem);
	},
});

storage.addRoute({
	path: '/api/storage/directory/:id/recursive',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id/recursive'> {
		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await Array.fromAsync(getRecursive(itemId)).catch(withError('Could not get some directory items'));
		return items;
	},
});

storage.addRoute({
	path: '/api/users/:id/storage',
	params: { id: z.uuid() },
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/storage'> {
		await checkAuthForUser(request, userId);

		const [stats, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(withError('Could not fetch data'));

		return Object.assign(stats, { limits });
	},
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage'> {
		const { sort } = parseSearch(request, UserStorageOptions);

		await checkAuthForUser(request, userId);

		const [items, stats, limits] = await Promise.all([
			database
				.selectFrom('storage')
				.selectAll()
				.select(acl.from('storage'))
				.where('userId', '=', userId)
				.where('trashedAt', 'is', null)
				.$if(!!sort, qb => qb.orderBy(sort!.by, sort!.descending ? 'desc' : 'asc'))
				.execute(),
			getUserStats(userId),
			getLimits(userId),
		]).catch(withError('Could not fetch data'));

		return Object.assign(stats, { limits, items: items.map(parseItem) });
	},
});

storage.addRoute({
	path: '/api/users/:id/storage/root',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/root'> {
		await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage')
			.selectAll()
			.select(acl.from('storage'))
			.where('userId', '=', userId)
			.where('trashedAt', 'is', null)
			.where('parentId', 'is', null)
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

storage.addRoute({
	path: '/api/users/:id/storage/shared',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/shared'> {
		const { user } = await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage as item')
			.selectAll('item')
			.select(acl.from<'storage', DBSchema & { item: DBSchema['storage'] }>('storage', { alias: 'item' }))
			.where('trashedAt', 'is', null)
			.where(acl.existsIn('storage', user, { alias: 'item' }))
			.where(eb => eb.not(acl.existsIn('storage', user, { alias: 'item', itemId: 'parentId' })))
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

storage.addRoute({
	path: '/api/users/:id/storage/trash',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/trash'> {
		await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage')
			.selectAll()
			.where('userId', '=', userId)
			.where('trashedAt', 'is not', null)
			.execute()
			.catch(withError('Could not get trash'));

		return items.map(parseItem);
	},
});
