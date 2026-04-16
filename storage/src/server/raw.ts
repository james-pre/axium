import { getConfig } from '@axium/core';
import { audit } from '@axium/server/audit';
import { authRequestForItem, requireSession } from '@axium/server/auth';
import { error, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createHash } from 'node:crypto';
import { copyFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import { streamRead } from '../node.js';
import '../polyfills.js';
import { getLimits } from './config.js';
import { getUserStats } from './db.js';
import { checkItemUpdate, checkNewItem, createNewItem, finishItemUpdate, requireUpload } from './item.js';

export function _contentDispositionFor(name: string, suffix: string = '') {
	const fallback =
		name
			.replace(/[\r\n]/g, '')
			.replace(/[^\x20-\x7E]/g, '_')
			.trim()
			.replace(/[\\"]/g, '\\$&') || 'download';

	const encoded = encodeURIComponent(name.replace(/[\r\n]/g, '')).replace(
		/['()*]/g,
		char => '%' + char.charCodeAt(0).toString(16).toUpperCase()
	);

	return `attachment; filename="${fallback}${suffix}"; filename*=UTF-8''${encoded}${suffix}`;
}

addRoute({
	path: '/raw/storage',
	async PUT(request): Promise<StorageItemMetadata> {
		if (!getConfig('@axium/storage').enabled) error(503, 'User storage is disabled');

		const session = await requireSession(request);
		const { userId } = session;

		const name = request.headers.get('x-name')!; // checked in `checkNewItem`
		const parentId = request.headers.get('x-parent');
		const size = BigInt(request.headers.get('x-size') || -1);
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

		const size = BigInt(request.headers.get('x-chunk-size') || -1);

		if (size < 0n) error(411, 'Missing or invalid chunk size');

		if (upload.uploadedBytes + size > upload.init.size) error(413, 'Upload exceeds allowed size');

		const offset = BigInt(request.headers.get('x-offset') || -1);
		if (offset != upload.uploadedBytes) error(400, `Expected offset ${upload.uploadedBytes} but got ${offset}`);

		if (!request.body) error(400, 'Missing request body');

		let actualSize = 0n;
		const counter = new TransformStream({
			transform(chunk, controller) {
				actualSize += BigInt(chunk.length);
				controller.enqueue(chunk);
			},
		});

		const [forFile, forHash] = request.body.pipeThrough(counter).tee();

		/* @todo Figure out if we need to handle stream cancellation differently.
		Right now an error with this chunk cancels the streams but may not cleanly fail the upload */
		await Promise.all([
			forFile.pipeTo(upload.stream, { preventClose: true }),
			forHash.pipeTo(upload.hashStream, { preventClose: true }),
		]);

		if (actualSize != size) {
			upload.remove();
			await audit('storage_size_mismatch', upload.userId, { item: null });
			error(400, `Content length mismatch: expected ${size}, got ${actualSize}`);
		}

		upload.uploadedBytes += actualSize;

		if (upload.uploadedBytes != upload.init.size) return new Response(null, { status: 204 });

		const hash = upload.hash.digest();
		upload.init.hash ??= hash.toHex();
		if (hash.toHex() != upload.init.hash) error(409, 'Hash mismatch');

		upload.remove();

		function writeContent(path: string) {
			try {
				renameSync(upload.file, path);
			} catch (e: any) {
				if (e.code != 'EXDEV') throw e;
				copyFileSync(upload.file, path);
			}
		}

		const item = upload.itemId
			? await finishItemUpdate(upload.itemId, upload.init.size, hash, writeContent)
			: await createNewItem(upload.init, upload.userId, writeContent);

		try {
			unlinkSync(upload.file);
		} catch {
			// probably renamed
		}

		return item;
	},
});

function parseRange(itemSize: bigint, range?: string | null): { start: number; end: number; length: number } {
	let start = 0,
		end = Number(itemSize - 1n),
		length = Number(itemSize);

	if (range) {
		const [_start, _end = end] = range
			.replace(/bytes=/, '')
			.split('-')
			.map(val => (val && Number.isSafeInteger(parseInt(val)) ? parseInt(val) : undefined));

		start = typeof _start == 'number' ? _start : Number(itemSize) - _end;
		end = typeof _start == 'number' ? _end : end;
		length = end - start + 1;
	}

	return { start, end, length };
}

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		const config = getConfig('@axium/storage');
		if (!config.enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const path = join(config.data, item.id);

		const { start, end, length } = parseRange(item.size, request.headers.get('range'));

		if (start >= item.size || end >= item.size || start > end || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${item.size}` },
			});
		}

		const content = streamRead(path, start, end);

		return new Response(content, {
			status: BigInt(length) == item.size ? 200 : 206,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${item.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(length),
				'Content-Type': item.type,
				'Content-Disposition': _contentDispositionFor(item.name),
			},
		});
	},
	async POST(request, { id: itemId }) {
		const { item, session } = await checkItemUpdate(request, itemId);

		const size = Number(request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		const [usage, limits] = await Promise.all([getUserStats(item.userId), getLimits(item.userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		if (limits.user_size && (usage.usedBytes + BigInt(size) - item.size) / 1_000_000n >= limits.user_size)
			error(413, 'Not enough space');

		if (limits.item_size && size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await request.bytes();

		if (content.byteLength > size) {
			await audit('storage_size_mismatch', session?.userId, { item: item.id });
			error(400, 'Actual content length does not match header');
		}

		const hash = createHash('BLAKE2b512').update(content).digest();

		return await finishItemUpdate(itemId, BigInt(size), hash, path => {
			writeFileSync(path, content);
		});
	},
});
