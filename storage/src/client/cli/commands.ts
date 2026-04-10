import { Command } from 'commander';
import * as io from 'ioium/node';
import mime from 'mime';
import * as fs from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { colorItem, formatItems } from '../../node.js';
import * as api from '../api.js';
import { getDirectory, resolveItem, resolvePathWithParent, syncCache } from '../local.js';

export const ls = new Command('ls')
	.alias('list')
	.description('List the contents of a folder')
	.argument('[path]', 'remote folder path')
	.option('-l, --long', 'show more details')
	.option('-h, --human-readable', 'show sizes in human readable format', false)
	.action(async function axium_files_ls(path = '', { long, humanReadable }) {
		const { users } = await syncCache();
		const items = await getDirectory(path);
		if (!long) {
			console.log(items.map(colorItem).join('\t'));
			return;
		}

		console.log('total ' + items.length);
		for (const text of formatItems({ items, users, humanReadable })) console.log(text);
	});

export const mkdir = new Command('mkdir')
	.description('Create a remote folder')
	.argument('<path>', 'remote folder path to create')
	.action(async (path: string) => {
		const { parent, name } = await resolvePathWithParent(path);
		await api.uploadItem(new Blob([], { type: 'inode/directory' }), { parentId: parent?.id, name });
	});

export const remove = new Command('remove')
	.command('rm')
	.description('Remove a file or folder')
	.argument('<path>', 'remote path to remove')
	.action(async (path: string) => {
		const item = await resolveItem(path);
		if (!item) io.exit('Could not resolve path.');
		await api.deleteItem(item.id);
	});

export const upload = new Command('upload')
	.description('Upload a file or folder')
	.argument('<local>', 'local file or folder path to upload')
	.argument('<remote>', 'remote path to upload to')
	.option('-f, --force', 'overwrite existing files')
	.option('-r, --recursive', 'operate recursively on local directories')
	.option('-T, --no-target-directory', 'always treat the remote path as a file')
	.action(async (local: string, remotePath: string, opts) => {
		const stats = fs.statSync(local);
		const existingTarget = await resolveItem(remotePath);
		let { parent, name } = await resolvePathWithParent(remotePath);

		if (stats.isDirectory()) {
			if (!opts.recursive) io.exit('--recursive/-r not specified but the local path is a directory');
			else io.exit('Uploading directories is not support yet');
		}

		if (existingTarget)
			if (existingTarget.type == 'inode/directory') {
				if (opts.targetDirectory) {
					parent = existingTarget;
					name = basename(local);
				} else io.exit('Directory exists at remote path');
			} else if (!opts.force) io.exit('File exists at remote path, use --force to overwrite it');

		const stream = Readable.toWeb(fs.createReadStream(local));
		const type = mime.getType(local) || 'application/octet-stream';
		using _ = io.start('Uploading ' + name);
		await api.uploadItemStream(stream as ReadableStream<Uint8Array<ArrayBuffer>>, {
			parentId: parent?.id,
			name,
			size: stats.size,
			type,
			onProgress(uploaded, total) {
				io.progress(uploaded, total, Math.round((uploaded / total) * 100) + '%');
			},
		});
		io.done();
	});
