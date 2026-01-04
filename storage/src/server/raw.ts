import { audit } from '@axium/server/audit';
import { checkAuthForItem, requireSession } from '@axium/server/auth';
import { config } from '@axium/server/config';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createHash } from 'node:crypto';
import { linkSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import '../polyfills.js';
import { defaultCASMime, getLimits } from './config.js';
import { getUserStats, parseItem, type SelectedItem } from './db.js';

addRoute({
	path: '/raw/storage',
	async PUT(request): Promise<StorageItemMetadata> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { userId } = await requireSession(request);

		const [usage, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		const name = request.headers.get('x-name');
		if (!name) error(400, 'Missing name header');
		if (name.length > 255) error(400, 'Name is too long');

		const maybeParentId = request.headers.get('x-parent');
		const parentId = maybeParentId
			? await z
					.uuid()
					.parseAsync(maybeParentId)
					.catch(() => error(400, 'Invalid parent ID'))
			: null;

		if (parentId) await checkAuthForItem(request, 'storage', parentId, { write: true });

		const size = Number(request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		if (limits.user_items && usage.itemCount >= limits.user_items) error(409, 'Too many items');

		if (limits.user_size && (usage.usedBytes + size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

		if (limits.item_size && size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await request.bytes();

		if (content.byteLength > size) {
			await audit('storage_size_mismatch', userId, { item: null });
			error(400, 'Content length does not match size header');
		}

		const type = request.headers.get('content-type') || 'application/octet-stream';
		const isDirectory = type == 'inode/directory';

		if (isDirectory && size > 0) error(400, 'Directories can not have content');

		const useCAS =
			config.storage.cas.enabled &&
			!isDirectory &&
			(defaultCASMime.some(pattern => pattern.test(type)) || config.storage.cas.include.some(mime => type.match(mime)));

		const hash = isDirectory ? null : createHash('BLAKE2b512').update(content).digest();

		const tx = await database.startTransaction().execute();

		try {
			const item = parseItem(
				await tx
					.insertInto('storage')
					.values({ userId, hash, name, size, type, immutable: useCAS, parentId })
					.returningAll()
					.executeTakeFirstOrThrow()
			);

			const path = join(config.storage.data, item.id);

			if (!useCAS) {
				if (!isDirectory) writeFileSync(path, content);
				await tx.commit().execute();
				return item;
			}

			const existing = await tx
				.selectFrom('storage')
				.select('id')
				.where('hash', '=', hash)
				.where('id', '!=', item.id)
				.limit(1)
				.executeTakeFirst();

			if (!existing) {
				if (!isDirectory) writeFileSync(path, content);
				await tx.commit().execute();
				return item;
			}

			linkSync(join(config.storage.data, existing.id), path);
			await tx.commit().execute();
			return item;
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not create item', 500)(error);
		}
	},
});

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { item } = await checkAuthForItem(request, 'storage', itemId, { read: true });

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const content = new Uint8Array(readFileSync(join(config.storage.data, item.id)));

		return new Response(content, {
			headers: {
				'Content-Type': item.type,
				'Content-Disposition': `attachment; filename="${item.name}"`,
			},
		});
	},
	async POST(request, { id: itemId }) {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const { item, session } = await checkAuthForItem(request, 'storage', itemId, { write: true });

		if (item.immutable) error(405, 'Item is immutable');
		if (item.type == 'inode/directory') error(409, 'Directories do not have content');
		if (item.trashedAt) error(410, 'Trashed items can not be changed');

		const type = request.headers.get('content-type') || 'application/octet-stream';

		if (type != item.type) {
			await audit('storage_type_mismatch', session?.userId, { item: item.id });
			error(400, 'Content type does not match existing item type');
		}

		const size = Number(request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		const [usage, limits] = await Promise.all([getUserStats(item.userId), getLimits(item.userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		if (limits.user_size && (usage.usedBytes + size - item.size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

		if (limits.item_size && size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await request.bytes();

		if (content.byteLength > size) {
			await audit('storage_size_mismatch', session?.userId, { item: item.id });
			error(400, 'Actual content length does not match header');
		}

		const hash = createHash('BLAKE2b512').update(content).digest();

		const tx = await database.startTransaction().execute();

		try {
			const result = await tx
				.updateTable('storage')
				.where('id', '=', itemId)
				.set({ size, modifiedAt: new Date(), hash })
				.returningAll()
				.executeTakeFirstOrThrow();

			writeFileSync(join(config.storage.data, result.id), content);

			await tx.commit().execute();
			return parseItem(result);
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not update item', 500)(error);
		}
	},
});
