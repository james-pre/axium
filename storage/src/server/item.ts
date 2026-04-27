import { getConfig, type Session } from '@axium/core';
import { audit } from '@axium/server/audit';
import { authRequestForItem, authSessionForItem, requireSession, type SessionAndUser, type SessionInternal } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { createHash, randomBytes, type Hash } from 'node:crypto';
import { createWriteStream, linkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
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
	if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

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

export interface UploadInfo {
	file: string;
	stream: WritableStream;
	hash: Hash;
	uploadedBytes: bigint;
	sessionId: string;
	userId: string;
	init: StorageItemInit;
	/** If set we are updating an existing item. Explicit null used to avoid bugs */
	itemId: string | null;

	/** Remove the upload from pending and clean up resources */
	remove(): void;
}

const inProgress = new Map<string, UploadInfo>();

export function startUpload(init: StorageItemInit, session: Session, itemId: string | null): string {
	const { temp_dir, upload_timeout } = getConfig('@axium/storage');

	const token = randomBytes(32);

	mkdirSync(temp_dir, { recursive: true });
	const file = join(temp_dir, token.toHex());

	let removed = false;

	function remove() {
		if (removed) return;
		removed = true;
		inProgress.delete(token.toBase64());
		void stream.close();
		hash.end();
	}

	const hash = createHash('BLAKE2b512'),
		stream = Writable.toWeb(createWriteStream(file));

	inProgress.set(token.toBase64(), {
		hash,
		file,
		stream,
		uploadedBytes: 0n,
		sessionId: session.id,
		userId: session.userId,
		init,
		itemId,
		remove,
	});

	setTimeout(() => {
		remove();
	}, upload_timeout * 60_000);

	return token.toBase64();
}

export async function requireUpload(request: Request): Promise<UploadInfo> {
	const token = request.headers.get('x-upload');
	if (!token) error(401, 'Missing upload token');
	const upload = inProgress.get(token);
	if (!upload) error(400, 'Invalid upload token');

	const session = await requireSession(request);

	if (session.id != upload.sessionId) error(403, 'Upload does not belong to the current session');
	if (session.userId != upload.userId) error(403, 'Upload does not belong to the current user');

	return upload;
}
