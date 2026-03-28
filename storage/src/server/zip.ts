import { getConfig } from '@axium/core';
import { authRequestForItem } from '@axium/server/auth';
import { error } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { crc32, createDeflateRaw } from 'node:zlib';
import * as z from 'zod';
import '../polyfills.js';
import { getRecursive } from './db.js';
import { _contentDispositionFor } from './raw.js';

const encoder = new TextEncoder();

interface ZipFileMetadata {
	name: Uint8Array;
	time: number;
	crc: number;
	size: number;
	csize: number;
	offset: number;
	dir: boolean;
}

addRoute({
	path: '/raw/storage/directory-zip/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		const config = getConfig('@axium/storage');
		if (!config.enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');
		if (item.type != 'inode/directory') error(410, 'Only folders can be downloaded as ZIP files');

		const stream = new Readable({ read() {} });
		let offset = 0;
		const files: ZipFileMetadata[] = [];

		const push = (b: Uint8Array) => {
			offset += b.length;
			stream.push(b);
		};

		(async () => {
			for await (const child of getRecursive(item.id)) {
				const isDir = child.type === 'inode/directory';
				const path = child.path + (isDir ? '/' : '');
				const name = encoder.encode(path);

				const time =
					(Math.max(0, child.modifiedAt.getFullYear() - 1980) << 25) |
					((child.modifiedAt.getMonth() + 1) << 21) |
					(child.modifiedAt.getDate() << 16) |
					(child.modifiedAt.getHours() << 11) |
					(child.modifiedAt.getMinutes() << 5) |
					(child.modifiedAt.getSeconds() >> 1);

				// Local file header
				const head = Buffer.alloc(30);
				head.writeUInt32LE(0x04034b50, 0);
				head.writeUInt16LE(20, 4);
				head.writeUInt16LE(isDir ? 0 : 8, 6); // flags: 8 for data descriptor
				head.writeUInt16LE(isDir ? 0 : 8, 8); // comp: 8 for deflate
				head.writeUInt32LE(time, 10);
				head.writeUInt16LE(name.length, 26);

				const recordOffset = offset;
				push(head);
				push(name);

				let crc = 0,
					usize = 0,
					csize = 0;

				if (!isDir) {
					const rs = createReadStream(join(config.data, child.id));
					const deflate = createDeflateRaw();

					rs.on('data', (b: Buffer) => {
						crc = crc32(b, crc);
						usize += b.length;
					});

					rs.pipe(deflate);

					for await (const chunk of deflate) {
						csize += chunk.length;
						push(chunk);
					}

					const desc = Buffer.alloc(16);
					desc.writeUInt32LE(0x08074b50, 0);
					desc.writeUInt32LE(crc, 4);
					desc.writeUInt32LE(csize, 8);
					desc.writeUInt32LE(usize, 12);
					push(desc);
				}

				files.push({ name, time, crc, size: usize, csize, offset: recordOffset, dir: isDir });
			}

			const cdrOffset = offset;

			for (const f of files) {
				// CD Record
				const cdr = Buffer.alloc(46);
				cdr.writeUInt32LE(0x02014b50, 0);
				cdr.writeUInt16LE(20, 4);
				cdr.writeUInt16LE(20, 6);
				cdr.writeUInt16LE(f.dir ? 0 : 8, 8);
				cdr.writeUInt16LE(f.dir ? 0 : 8, 10);
				cdr.writeUInt32LE(f.time, 12);
				cdr.writeUInt32LE(f.crc, 16);
				cdr.writeUInt32LE(f.csize, 20);
				cdr.writeUInt32LE(f.size, 24);
				cdr.writeUInt16LE(f.name.length, 28);
				cdr.writeUInt32LE(f.offset, 42);
				push(cdr);
				push(f.name);
			}

			// EOCD
			const end = Buffer.alloc(22);
			end.writeUInt32LE(0x06054b50, 0);
			end.writeUInt16LE(files.length, 8);
			end.writeUInt16LE(files.length, 10);
			end.writeUInt32LE(offset - cdrOffset, 12);
			end.writeUInt32LE(cdrOffset, 16);
			push(end);

			stream.push(null);
		})().catch(err => stream.destroy(err));

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 200,
			headers: {
				'Content-Type': item.type,
				'Content-Disposition': _contentDispositionFor(item.name, '.zip'),
			},
		});
	},
});
