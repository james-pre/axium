import { getConfig, type Session } from '@axium/core';
import { authSessionForItem, requireSession, type SessionAndUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { createHash, randomBytes, type Hash } from 'node:crypto';
import { closeSync, linkSync, mkdirSync, openSync } from 'node:fs';
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
	const { userId } = session;

	const { size, name, type, hash } = init;

	const [usage, limits] = await Promise.all([getUserStats(userId), getLimits(userId)]).catch(
		withError('Could not fetch usage and/or limits')
	);

	if (!name) error(400, 'Missing name');
	if (name.length > 255) error(400, 'Name is too long');

	const parentId = init.parentId
		? await z
				.uuid()
				.parseAsync(init.parentId)
				.catch(() => error(400, 'Invalid parent ID'))
		: null;

	if (parentId) await authSessionForItem('storage', parentId, { write: true }, session);

	if (Number.isNaN(size)) error(411, 'Missing or invalid content length');

	if (limits.user_items && usage.itemCount >= limits.user_items) error(409, 'Too many items');

	if (limits.user_size && (usage.usedBytes + size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

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

export interface UploadInfo {
	file: string;
	fd: number;
	hash: Hash;
	uploadedBytes: number;
	sessionId: string;
	userId: string;
	init: StorageItemInit;
	remove(): void;
}

const inProgress = new Map<string, UploadInfo>();

export function startUpload(init: StorageItemInit, session: Session): string {
	const { temp_dir, upload_timeout } = getConfig('@axium/storage');

	const token = randomBytes(32);

	mkdirSync(temp_dir, { recursive: true });
	const file = join(temp_dir, token.toHex());

	const fd = openSync(file, 'a');

	let removed = false;

	function remove() {
		if (removed) return;
		removed = true;
		inProgress.delete(token.toBase64());
		closeSync(fd);
	}

	inProgress.set(token.toBase64(), {
		hash: createHash('BLAKE2b512'),
		file,
		fd,
		uploadedBytes: 0,
		sessionId: session.id,
		userId: session.userId,
		init,
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
