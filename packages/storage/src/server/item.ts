import { getConfig } from '@axium/core';
import { audit } from '@axium/server/audit';
import { authRequestForItem, authSessionForItem, type SessionAndUser, type SessionInternal } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { UploadManager } from '@axium/server/uploads';
import { linkSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import type { StorageItemInit, StorageItemMetadata } from '../common.js';
import '../polyfills.js';
import { defaultCASMime, getLimits } from './config.js';
import { getUserStats, parseItem } from './db.js';

export interface NewItemResult {
	existing?: { id: string };
	needsHashing?: boolean;
}

export function useCAS(type: string) {
	const { cas } = getConfig('@axium/storage');

	return !!(
		cas.enabled &&
		type != 'inode/directory' &&
		(defaultCASMime.some(pattern => pattern.test(type)) || cas.include?.some(mime => type.match(mime)))
	);
}

export async function checkNewItem(init: StorageItemInit, session: SessionAndUser): Promise<NewItemResult> {
	const { size, type, hash } = init;

	const [usage, limits] = await Promise.all([getUserStats(session.userId), getLimits(session.userId)]).catch(
		withError('Could not fetch usage and/or limits')
	);

	const parentId = init.parentId
		? await z
				.uuid()
				.parseAsync(init.parentId)
				.catch(() => error(400, 'Invalid parent ID'))
		: null;

	if (parentId) await authSessionForItem('storage', parentId, { write: true }, session);

	if (limits.user_items && usage.itemCount >= limits.user_items) error(409, 'Too many items');

	if (limits.user_size && (usage.usedBytes + size) / 1_000_000n >= limits.user_size) error(413, 'Not enough space');

	if (limits.item_size && size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

	const isDirectory = type == 'inode/directory';

	if (isDirectory && size > 0) error(400, 'Directories can not have content');

	if (!useCAS(type)) return {};

	if (!hash) return { needsHashing: true };

	const existing = await database
		.selectFrom('storage')
		.select('id')
		.where(eb => eb.and({ hash: Uint8Array.fromHex(hash), immutable: true }))
		.limit(1)
		.executeTakeFirst();

	return { existing };
}

export async function createNewItem(
	init: StorageItemInit,
	userId: string,
	writeContent?: (path: string) => void
): Promise<StorageItemMetadata> {
	const tx = await database.startTransaction().execute();

	const { data: dataDir } = getConfig('@axium/storage');

	const immutable = useCAS(init.type);

	try {
		const hash = typeof init.hash == 'string' ? Uint8Array.fromHex(init.hash) : null;

		const existing = immutable
			? await database
					.selectFrom('storage')
					.select('id')
					.where(eb => eb.and({ hash, immutable: true }))
					.limit(1)
					.executeTakeFirst()
			: null;

		const item = parseItem(
			await tx
				.insertInto('storage')
				.values({
					...init,
					userId,
					immutable,
					hash,
				})
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(e => {
					if (!(e instanceof Error)) throw e;
					if (e.message.includes('unique_name_parentId') && e.message.includes('duplicate'))
						error(409, 'A file with that name already exists in this folder.');
					throw e;
				})
		);

		const path = join(dataDir, item.id);

		if (existing) linkSync(join(dataDir, existing.id), path);
		else if (init.type != 'inode/directory') {
			if (!writeContent) error(501, 'Missing writeContent (this is a bug!)');
			writeContent(path);
		}

		await tx.commit().execute();
		return item;
	} catch (error: any) {
		await tx.rollback().execute();
		throw withError('Could not create item', 500)(error);
	}
}

export interface ItemUpdateCheckResult {
	item: StorageItemMetadata;
	session?: SessionInternal;
}

export async function checkItemUpdate(request: Request, itemId: string): Promise<ItemUpdateCheckResult> {
	const { item, session } = await authRequestForItem(request, 'storage', itemId, { write: true }, true);

	if (item.immutable) error(405, 'Item is immutable');
	if (item.type == 'inode/directory') error(409, 'Directories do not have content');
	if (item.trashedAt) error(410, 'Trashed items can not be changed');

	const type = request.headers.get('content-type') || 'application/octet-stream';

	if (type != item.type) {
		await audit('storage_type_mismatch', session?.userId, { item: item.id });
		error(400, 'Content type does not match existing item type');
	}

	return { item: parseItem(item), session };
}

export async function finishItemUpdate(
	itemId: string,
	size: bigint,
	hash: Uint8Array<ArrayBuffer>,
	writeContent?: (path: string) => void
): Promise<StorageItemMetadata> {
	const tx = await database.startTransaction().execute();

	const { data: dataDir } = getConfig('@axium/storage');

	const path = join(dataDir, itemId);

	try {
		const result = await tx
			.updateTable('storage')
			.where('id', '=', itemId)
			.set({ size, modifiedAt: new Date(), hash })
			.returningAll()
			.executeTakeFirstOrThrow();

		if (!writeContent) error(501, 'Missing writeContent (this is a bug!)');
		writeContent(path);

		await tx.commit().execute();
		return parseItem(result);
	} catch (error: any) {
		await tx.rollback().execute();
		throw withError('Could not update item', 500)(error);
	}
}

export const uploads = new UploadManager<StorageItemInit, { itemId: string | null }>(() => getConfig('@axium/storage').upload);
