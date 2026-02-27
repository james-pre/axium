import { getConfig } from '@axium/core';
import { audit } from '@axium/server/audit';
import { authRequestForItem, requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import '../polyfills.js';
import { getLimits } from './config.js';
import { getUserStats, parseItem } from './db.js';
import { checkNewItem, createNewItem, requireUpload } from './item.js';

addRoute({
	path: '/raw/storage',
	async PUT(request): Promise<StorageItemMetadata> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const session = await requireSession(request);
		const { userId } = session;

		const name = request.headers.get('x-name')!; // checked in `checkNewItem`
		const parentId = request.headers.get('x-parent');
		const size = Number(request.headers.get('x-size'));
		const type = request.headers.get('content-type') || 'application/octet-stream';

		const content = await request.bytes();

		if (content.byteLength > size) {
			await audit('storage_size_mismatch', userId, { item: null });
			error(400, 'Content length does not match size header');
		}

		const hash = type == 'inode/directory' ? null : createHash('BLAKE2b512').update(content).digest();

		const init = { name, size, type, parentId, hash: hash?.toHex() };

		await checkNewItem(init, session);

		return await createNewItem(init, userId, path => writeFileSync(path, content));
	},
});

addRoute({
	path: '/raw/storage/chunk',
	async POST(request) {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const upload = await requireUpload(request);

		const size = Number(request.headers.get('content-length'));

		if (Number.isNaN(size)) error(411, 'Missing or invalid content length');

		if (upload.uploadedBytes + size > upload.init.size) error(413, 'Upload exceeds allowed size');

		const content = await request.bytes();

		if (content.byteLength != size) {
			await audit('storage_size_mismatch', upload.userId, { item: null });
			error(400, `Content length mismatch: expected ${size}, got ${content.byteLength}`);
		}

		const offset = Number(request.headers.get('x-offset'));
		if (offset != upload.uploadedBytes) error(400, `Expected offset ${upload.uploadedBytes} but got ${offset}`);

		writeSync(upload.fd, content); // opened with 'a', this appends
		upload.hash.update(content);
		upload.uploadedBytes += size;

		if (upload.uploadedBytes != upload.init.size) return new Response(null, { status: 204 });

		const hash = upload.hash.digest();
		upload.init.hash ??= hash.toHex();
		if (hash.toHex() != upload.init.hash) error(409, 'Hash mismatch');

		upload.remove();

		const item = await createNewItem(upload.init, upload.userId, path => {
			try {
				renameSync(upload.file, path);
			} catch (e: any) {
				if (e.code != 'EXDEV') throw e;
				writeFileSync(path, readFileSync(upload.file));
			}
		});

		try {
			unlinkSync(upload.file);
		} catch {
			// probably renamed
		}

		return item;
	},
});

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const path = join(getConfig('@axium/storage').data, item.id);
		const range = request.headers.get('range');

		const fd = openSync(path, 'r');
		using _ = { [Symbol.dispose]: () => closeSync(fd) };

		let start = 0,
			end = item.size - 1,
			length = item.size;

		if (range) {
			const [_start, _end = item.size - 1] = range
				.replace(/bytes=/, '')
				.split('-')
				.map(val => (val && Number.isSafeInteger(parseInt(val)) ? parseInt(val) : undefined));

			start = typeof _start == 'number' ? _start : item.size - _end;
			end = typeof _start == 'number' ? _end : item.size - 1;
			length = end - start + 1;
		}

		if (start >= item.size || end >= item.size || start > end || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${item.size}` },
			});
		}

		const content = new Uint8Array(length);

		readSync(fd, content, 0, length, start);

		return new Response(content, {
			status: length == item.size ? 200 : 206,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${item.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(length),
				'Content-Type': item.type,
				'Content-Disposition': `attachment; filename="${item.name}"`,
			},
		});
	},
	async POST(request, { id: itemId }) {
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

			writeFileSync(join(getConfig('@axium/storage').data, result.id), content);

			await tx.commit().execute();
			return parseItem(result);
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not update item', 500)(error);
		}
	},
});
