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
	zip64DD?: boolean;
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
				head.writeUInt16LE(45, 4);
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

					const useZip64DD = usize >= 0xffffffff || csize >= 0xffffffff;
					if (useZip64DD) {
						const desc = Buffer.alloc(24);
						desc.writeUInt32LE(0x08074b50, 0);
						desc.writeUInt32LE(crc, 4);
						desc.writeBigUInt64LE(BigInt(csize), 8);
						desc.writeBigUInt64LE(BigInt(usize), 16);
						push(desc);
					} else {
						const desc = Buffer.alloc(16);
						desc.writeUInt32LE(0x08074b50, 0);
						desc.writeUInt32LE(crc, 4);
						desc.writeUInt32LE(csize, 8);
						desc.writeUInt32LE(usize, 12);
						push(desc);
					}
				}

				const useZip64DDFinal = usize >= 0xffffffff || csize >= 0xffffffff;
				files.push({ name, time, crc, size: usize, csize, offset: recordOffset, dir: isDir, zip64DD: useZip64DDFinal });
			}

			const cdrOffset = offset;

			for (const f of files) {
				const size32 = Math.min(f.size, 0xffffffff);
				const csize32 = Math.min(f.csize, 0xffffffff);
				const offset32 = Math.min(f.offset, 0xffffffff);

				let extraLength = 0;
				if (size32 === 0xffffffff) extraLength += 8;
				if (csize32 === 0xffffffff) extraLength += 8;
				if (offset32 === 0xffffffff) extraLength += 8;

				const extraData = Buffer.alloc(extraLength > 0 ? 4 + extraLength : 0);
				if (extraLength > 0) {
					extraData.writeUInt16LE(0x0001, 0);
					extraData.writeUInt16LE(extraLength, 2);
					let exOff = 4;
					if (size32 === 0xffffffff) {
						extraData.writeBigUInt64LE(BigInt(f.size), exOff);
						exOff += 8;
					}
					if (csize32 === 0xffffffff) {
						extraData.writeBigUInt64LE(BigInt(f.csize), exOff);
						exOff += 8;
					}
					if (offset32 === 0xffffffff) {
						extraData.writeBigUInt64LE(BigInt(f.offset), exOff);
					}
				}

				const versionNeeded = extraLength > 0 || f.zip64DD ? 45 : 20;

				// CD Record
				const cdr = Buffer.alloc(46);
				cdr.writeUInt32LE(0x02014b50, 0);
				cdr.writeUInt16LE(45, 4);
				cdr.writeUInt16LE(versionNeeded, 6);
				cdr.writeUInt16LE(f.dir ? 0 : 8, 8);
				cdr.writeUInt16LE(f.dir ? 0 : 8, 10);
				cdr.writeUInt32LE(f.time, 12);
				cdr.writeUInt32LE(f.crc, 16);
				cdr.writeUInt32LE(csize32, 20);
				cdr.writeUInt32LE(size32, 24);
				cdr.writeUInt16LE(f.name.length, 28);
				cdr.writeUInt16LE(extraData.length, 30);
				cdr.writeUInt32LE(offset32, 42);
				push(cdr);
				push(f.name);
				if (extraData.length > 0) push(extraData);
			}

			const endOffset = offset;
			const cdrSize = endOffset - cdrOffset;

			const numFiles16 = files.length >= 0xffff ? 0xffff : files.length;
			const cdrSize32 = cdrSize >= 0xffffffff ? 0xffffffff : cdrSize;
			const cdrOffset32 = cdrOffset >= 0xffffffff ? 0xffffffff : cdrOffset;

			const isZip64EOCD = files.length >= 0xffff || cdrSize >= 0xffffffff || cdrOffset >= 0xffffffff;

			if (isZip64EOCD) {
				const zip64eocd = Buffer.alloc(56);
				zip64eocd.writeUInt32LE(0x06064b50, 0);
				zip64eocd.writeBigUInt64LE(BigInt(44), 4);
				zip64eocd.writeUInt16LE(45, 12);
				zip64eocd.writeUInt16LE(45, 14);
				zip64eocd.writeUInt32LE(0, 16);
				zip64eocd.writeUInt32LE(0, 20);
				zip64eocd.writeBigUInt64LE(BigInt(files.length), 24);
				zip64eocd.writeBigUInt64LE(BigInt(files.length), 32);
				zip64eocd.writeBigUInt64LE(BigInt(cdrSize), 40);
				zip64eocd.writeBigUInt64LE(BigInt(cdrOffset), 48);
				push(zip64eocd);

				const locator = Buffer.alloc(20);
				locator.writeUInt32LE(0x07064b50, 0);
				locator.writeUInt32LE(0, 4);
				locator.writeBigUInt64LE(BigInt(endOffset), 8);
				locator.writeUInt32LE(1, 16);
				push(locator);
			}

			// EOCD
			const end = Buffer.alloc(22);
			end.writeUInt32LE(0x06054b50, 0);
			end.writeUInt16LE(numFiles16, 8);
			end.writeUInt16LE(numFiles16, 10);
			end.writeUInt32LE(cdrSize32, 12);
			end.writeUInt32LE(cdrOffset32, 16);
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
