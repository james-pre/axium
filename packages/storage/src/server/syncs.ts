import type { AsyncResult } from '@axium/core';
import { authRequestForItem } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import { StorageSync, StorageSyncDeviceInit, StorageSyncInit } from '../common.js';
import '../polyfills.js';

export async function getSync(itemId: string): Promise<StorageSync | undefined> {
	const sync = await database
		.selectFrom('storage_syncs')
		.selectAll()
		.select(eb =>
			jsonArrayFrom(
				eb
					.selectFrom('storage_sync_devices')
					.selectAll('storage_sync_devices')
					.whereRef('storage_sync_devices.itemId', '=', 'storage_syncs.itemId')
			).as('devices')
		)
		.where('itemId', '=', itemId)
		.executeTakeFirst()
		.catch(withError('Could not get sync'));

	return sync && StorageSync.parse(sync);
}

addRoute({
	path: '/api/storage/sync/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }): AsyncResult<'GET', 'storage/sync/:id'> {
		await authRequestForItem(request, 'storage', itemId, { read: true }, true);
		return (await getSync(itemId)) ?? error(404, 'Folder is not synced');
	},
	async PUT(request, { id: itemId }): AsyncResult<'PUT', 'storage/sync/:id'> {
		const { rules } = await parseBody(request, StorageSyncInit);

		const { item } = await authRequestForItem(request, 'storage', itemId, { write: true }, true);
		if (item.type != 'inode/directory') error(409, 'Only folders can be synced');

		await database
			.insertInto('storage_syncs')
			.values({ itemId, rules })
			.onConflict(oc => oc.column('itemId').doUpdateSet({ rules }))
			.execute()
			.catch(withError('Could not update sync'));

		return (await getSync(itemId))!;
	},
	async DELETE(request, { id: itemId }): AsyncResult<'DELETE', 'storage/sync/:id'> {
		await authRequestForItem(request, 'storage', itemId, { write: true }, true);

		const sync = (await getSync(itemId)) ?? error(404, 'Folder is not synced');

		await database.deleteFrom('storage_syncs').where('itemId', '=', itemId).execute().catch(withError('Could not delete sync'));

		return sync;
	},
});

addRoute({
	path: '/api/storage/sync/:id/device',
	params: { id: z.uuid() },
	async PUT(request, { id: itemId }): AsyncResult<'PUT', 'storage/sync/:id/device'> {
		const init = await parseBody(request, StorageSyncDeviceInit);

		const { session } = await authRequestForItem(request, 'storage', itemId, { write: true }, true);
		if (!session) error(401, 'You must be logged in to sync');

		if (!(await getSync(itemId))) error(404, 'Folder is not synced');

		const device = { ...init, itemId, userId: session.userId };

		return await database
			.insertInto('storage_sync_devices')
			.values(device)
			.onConflict(oc => oc.columns(['itemId', 'userId', 'host']).doUpdateSet(init))
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update sync device'));
	},
	/** Removes a device, and the sync once no devices are left. */
	async DELETE(request, { id: itemId }): AsyncResult<'DELETE', 'storage/sync/:id/device'> {
		const { host } = await parseBody(request, StorageSyncDeviceInit.pick({ host: true }));

		const { session } = await authRequestForItem(request, 'storage', itemId, { write: true }, true);
		if (!session) error(401, 'You must be logged in to sync');

		const device =
			(await database
				.deleteFrom('storage_sync_devices')
				.where('itemId', '=', itemId)
				.where('userId', '=', session.userId)
				.where('host', '=', host)
				.returningAll()
				.executeTakeFirst()
				.catch(withError('Could not remove sync device'))) ?? error(404, 'Device is not syncing this folder');

		await database
			.deleteFrom('storage_syncs')
			.where('itemId', '=', itemId)
			.where(eb => eb.not(eb.exists(eb.selectFrom('storage_sync_devices').select('host').where('itemId', '=', itemId))))
			.execute()
			.catch(withError('Could not remove unused sync'));

		return device;
	},
});
