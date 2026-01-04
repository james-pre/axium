import type { AccessControl, AsyncResult } from '@axium/core';
import * as acl from '@axium/server/acl';
import { audit } from '@axium/server/audit';
import { requireSession } from '@axium/server/auth';
import config from '@axium/server/config';
import { database } from '@axium/server/database';
import { withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { StorageBatchUpdate, type StorageItemMetadata } from '../common.js';
import { getLimits } from './config.js';
import { getRecursiveIds, getUserStats, parseItem } from './db.js';

addRoute({
	path: '/api/storage/batch',
	async POST(req): AsyncResult<'POST', 'storage/batch'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');
		if (!config.storage.batch.enabled) error(503, 'Batch updates are disabled');

		const { userId } = await requireSession(req);

		const [usage, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		const batchHeaderSize = Number(req.headers.get('x-batch-header-size'));
		if (!Number.isSafeInteger(batchHeaderSize) || batchHeaderSize < 2) error(400, 'Invalid or missing header, X-Batch-Header-Size');

		const size = Number(req.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		const raw = await req.bytes();

		if (raw.byteLength - batchHeaderSize > size) {
			await audit('storage_size_mismatch', userId, { item: null });
			error(400, 'Content length does not match size header');
		}

		if (req.headers.get('content-type') != 'x-axium/storage-batch') error(415, 'Invalid content type, expected x-axium/storage-batch');

		let header: StorageBatchUpdate;
		try {
			const text = new TextDecoder().decode(raw.subarray(0, batchHeaderSize));
			header = StorageBatchUpdate.parse(JSON.parse(text));
		} catch (e: any) {
			error(400, e instanceof z.core.$ZodError ? z.prettifyError(e) : 'invalid batch header');
		}

		const deletedIds = new Set(header.deleted);
		const changedIds = new Set(Object.keys(header.content));

		for (const id of [...Object.keys(header.metadata), ...changedIds]) {
			if (deletedIds.has(id)) error(400, 'Item cannot be updated and deleted in the same batch: ' + id);
		}

		// checkAuthForItem but optimized to not re-fetch the session and also only run one DB query

		const items = await database
			.selectFrom('storage')
			.selectAll()
			.where('id', 'in', [...deletedIds, ...Object.keys(header.metadata), ...changedIds])
			.select(acl.from('acl.storage', { userId }))
			.$castTo<acl.WithACL<'storage'>>()
			.execute()
			.catch(withError('Item(s) not found', 404));

		for (const item of items) {
			if (changedIds.has(item.id)) {
				// Extra checks for content changes

				if (item.immutable) error(409, 'Item is immutable and cannot be modified: ' + item.id);
				if (item.type == 'inode/directory') error(409, 'Directories do not have content');
				if (item.trashedAt) error(410, 'Trashed items can not be changed');

				if (limits.item_size && size > limits.item_size * 1_000_000) error(413, 'Item size exceeds maximum size: ' + item.id);
			}

			if (userId == item.userId) continue;

			if (!item.acl || !item.acl.length) error(403, 'Missing permission for item: ' + item.id);

			acl.check(item.acl, changedIds.has(item.id) ? { write: true } : { manage: true });

			error(403, 'Missing permission for item: ' + item.id);
		}

		if (limits.user_size && (usage.usedBytes + size - items.reduce((sum, item) => sum + item.size, 0)) / 1_000_000 >= limits.user_size)
			error(413, 'Not enough space');

		const tx = await database.startTransaction().execute();

		const results = new Map<string, StorageItemMetadata>();

		try {
			for (const [itemId, { offset, size }] of Object.entries(header.content)) {
				const content = raw.subarray(offset, offset + size);
				const hash = createHash('BLAKE2b512').update(content).digest();

				const result = await tx
					.updateTable('storage')
					.where('id', '=', itemId)
					.set({ size, modifiedAt: new Date(), hash })
					.returningAll()
					.executeTakeFirstOrThrow();

				writeFileSync(join(config.storage.data, result.id), content);

				await tx.commit().execute();
				results.set(itemId, parseItem(result));
			}

			const toDelete = await Array.fromAsync(getRecursiveIds(...header.deleted)).catch(
				withError('Could not get items to delete', 500)
			);

			const deleted = await tx.deleteFrom('storage').where('id', 'in', header.deleted).returningAll().execute();
			for (const id of toDelete) unlinkSync(join(config.storage.data, id));
			for (const item of deleted) results.set(item.id, parseItem(item));

			for (const [itemId, update] of Object.entries(header.metadata)) {
				const values: Partial<Pick<StorageItemMetadata, 'trashedAt' | 'userId' | 'name'>> = {};
				if ('trash' in update) values.trashedAt = update.trash ? new Date() : null;
				if ('owner' in update) values.userId = update.owner;
				if ('name' in update) values.name = update.name;

				if (!Object.keys(values).length) error(400, 'No valid fields to update: ' + itemId);

				const updated = await tx
					.updateTable('storage')
					.where('id', '=', itemId)
					.set(values)
					.returningAll()
					.executeTakeFirstOrThrow()
					.catch(withError('Could not update item: ' + itemId));

				results.set(itemId, parseItem(updated));
			}
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not update item', 500)(error);
		}

		return Array.from(results.values());
	},
});
