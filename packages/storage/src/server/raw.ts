import { getConfig } from '@axium/core';
import { audit } from '@axium/server/audit';
import { authRequestForItem, requireSession } from '@axium/server/auth';
import { error, parseRequestRange, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata } from '../common.js';
import { streamRead } from '../node.js';
import '../polyfills.js';
import { getLimits } from './config.js';
import { getUserStats } from './db.js';
import { checkItemUpdate, checkNewItem, createNewItem, finishItemUpdate, uploads } from './item.js';

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

uploads.addEndpoint('/raw/storage/upload', upload => {
	return upload.data.itemId
		? finishItemUpdate(upload.data.itemId, upload.init.size, upload.hash, upload.writeTo)
		: createNewItem(upload.init, upload.userId, upload.writeTo);
});

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const path = join(getConfig('@axium/storage').data, item.id);

		const range = request.headers.get('range');

		const { start, end, length } = parseRequestRange(item.size, range);

		if (start >= item.size || end >= item.size || start > end || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${item.size}` },
			});
		}

		const content = streamRead(path, start, end);

		return new Response(content, {
			status: range ? 206 : 200,
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
