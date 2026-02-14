import { getConfig, type AsyncResult, type Result } from '@axium/core';
import * as acl from '@axium/server/acl';
import { authRequestForItem, checkAuthForUser, requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, json, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { pick } from 'utilium';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import { batchFormatVersion, StorageItemInit, StorageItemUpdate, syncProtocolVersion } from '../common.js';
import '../polyfills.js';
import { getLimits } from './config.js';
import { deleteRecursive, getRecursive, getUserStats, parseItem } from './db.js';
import { checkNewItem, createNewItem, startUpload } from './item.js';

addRoute({
	path: '/api/storage',
	OPTIONS(): Result<'OPTIONS', 'storage'> {
		return {
			...pick(getConfig('@axium/storage'), 'batch', 'max_transfer_size'),
			syncProtocolVersion,
			batchFormatVersion,
		};
	},
	async PUT(request): Promise<Response> {
		type R = Result<'PUT', 'storage'>;

		const { enabled, ...rest } = getConfig('@axium/storage');

		if (!enabled) error(503, 'User storage is disabled');

		const session = await requireSession(request);

		const init = await parseBody(request, StorageItemInit);
		const { existing } = await checkNewItem(init, session);

		if (existing || init.type == 'inode/directory') {
			const item = await createNewItem(init, session.userId);
			return json({ status: 'created', item } satisfies R, { status: 201 });
		}

		return json(
			{
				...pick(rest, 'batch', 'max_transfer_size'),
				status: 'accepted',
				token: startUpload(init, session),
			} satisfies R,
			{ status: 202 }
		);
	},
});

addRoute({
	path: '/api/storage/item/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/item/:id'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true });

		return parseItem(item);
	},
	async PATCH(request, { id: itemId }): AsyncResult<'PATCH', 'storage/item/:id'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const body = await parseBody(request, StorageItemUpdate);

		await authRequestForItem(request, 'storage', itemId, { manage: true });

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
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const auth = await authRequestForItem(request, 'storage', itemId, { manage: true });
		const item = parseItem(auth.item);

		await deleteRecursive(item.type != 'inode/directory', itemId);

		return item;
	},
});

addRoute({
	path: '/api/storage/directory/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true });

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

addRoute({
	path: '/api/storage/directory/:id/recursive',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/directory/:id/recursive'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true });

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await Array.fromAsync(getRecursive(itemId)).catch(withError('Could not get some directory items'));
		return items;
	},
});

addRoute({
	path: '/api/users/:id/storage',
	params: { id: z.uuid() },
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/storage'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const [stats, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(withError('Could not fetch data'));

		return Object.assign(stats, { limits });
	},
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

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
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage')
			.select(acl.from('storage'))
			.where('userId', '=', userId)
			.where('trashedAt', 'is', null)
			.where('parentId', 'is', null)
			.selectAll()
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

addRoute({
	path: '/api/users/:id/storage/shared',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/shared'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const { user } = await checkAuthForUser(request, userId);

		const items = await database
			.selectFrom('storage as item')
			.selectAll('item')
			.select(acl.from('storage', { alias: 'item' }) as any)
			.where('trashedAt', 'is', null)
			.where(acl.existsIn('storage', user, { alias: 'item' }))
			.where(eb => eb.not(acl.existsIn('storage', user, { alias: 'item', itemId: 'parentId' })))
			.execute()
			.catch(withError('Could not get storage items'));

		return items.map(parseItem);
	},
});

addRoute({
	path: '/api/users/:id/storage/trash',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/storage/trash'> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

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
