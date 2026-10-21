import { pull } from '@axium/client/cli/sync';
import { Command } from 'commander';
import * as io from 'ioium/node';
import mime from 'mime';
import * as fs from 'node:fs';
import { basename, join, parse } from 'node:path';
import { bytes as formatBytes } from 'utilium/format';
import type { StorageItemMetadata } from '../../common.js';
import { colorItem, formatItems, streamRead, streamWrite } from '../../node.js';
import * as api from '../api.js';
import { getDirectory, getItems, resolveItem, resolvePath, resolvePathWithParent } from '../local.js';

export const ls = new Command('ls')
	.alias('list')
	.description('List the contents of a folder')
	.argument('[path]', 'remote folder path')
	.option('-l, --long', 'show more details')
	.option('-h, --human-readable', 'show sizes in human readable format', false)
	.action(async function axium_files_ls(path = '', { long, humanReadable }) {
		const items = getDirectory(path);
		if (!long) {
			console.log(items.map(colorItem).join('\t'));
			return;
		}

		console.log('total ' + items.length);
		for await (const text of formatItems(items, humanReadable)) console.log(text);
	});

export const mkdir = new Command('mkdir')
	.description('Create a remote folder')
	.argument('<path>', 'remote folder path to create')
	.action(async (path: string) => {
		const { parent, name } = resolvePathWithParent(path);
		await api.createDirectory(name, parent?.id);
		await pull();
	});

export const remove = new Command('remove')
	.alias('rm')
	.description('Remove a file or folder')
	.argument('<path>', 'remote path to remove')
	.action(async (path: string) => {
		const item = resolveItem(path);
		if (!item) throw 'Could not resolve path.';
		await api.deleteItem(item.id);
		await pull();
	});

function onProgress(uploaded: number, total: number): void {
	io.progress(uploaded, total, Math.round((uploaded / total) * 100) + '%', `${formatBytes(uploaded)}/${formatBytes(total)}`);
}

async function doUpload(
	local: string,
	name: string,
	stats: fs.Stats | fs.BigIntStats,
	parentId?: string,
	text: string = name,
	existingId?: string
): Promise<StorageItemMetadata> {
	const type = mime.getType(local) || 'application/octet-stream';
	using _ = io.start('Uploading ' + text);
	const stream = streamRead(local);
	const size = Number(stats.size),
		modifiedAt = stats.mtime;
	if (existingId) return await api.updateItem(existingId, stream, { size, modifiedAt, onProgress });
	return await api.createItem(stream, { parentId, name, size, type, modifiedAt, onProgress });
}

export const upload = new Command('upload')
	.description('Upload a file or folder')
	.argument('<local>', 'local file or folder path to upload')
	.argument('<remote>', 'remote path to upload to')
	.option('-f, --force', 'overwrite existing files')
	.option('-r, --recursive', 'operate recursively on local directories')
	.option('-T, --no-target-directory', 'always treat the remote path as a file')
	.action(async (local: string, remotePath: string, opts) => {
		const stats = fs.statSync(local);
		const isRoot = resolvePath(remotePath) == '/';
		const existingTarget = resolveItem(remotePath);

		if (!stats.isDirectory()) {
			let parent, name, existing;
			if (isRoot || existingTarget?.type == 'inode/directory') {
				if (!opts.targetDirectory) throw 'Directory exists at remote path: ' + remotePath;
				parent = existingTarget;
				name = basename(local);
				existing = resolveItem(join(remotePath, name));
				if (existing?.type == 'inode/directory') throw 'Directory exists at remote path: ' + existing.name;
			} else {
				({ parent, name } = resolvePathWithParent(remotePath));
				existing = existingTarget;
			}

			if (existing && !opts.force) throw 'File exists at remote path, use --force to overwrite it';

			await doUpload(local, name, stats, parent?.id, name, existing?.id);
			await pull();
			return;
		}

		if (!opts.recursive) throw '--recursive/-r not specified but the local path is a directory';

		if (isRoot || existingTarget) throw 'Folder exists at remote path. Merging is not supported yet.';

		const { parent, name } = resolvePathWithParent(remotePath);

		const toUpload: { path: string; stats: fs.BigIntStats; full: string }[] = [];
		let sum = 0n;

		// Sort to make sure directories come first, e.g. `example` and `example/duck`
		for (const path of fs.readdirSync(local, { recursive: true, encoding: 'utf8' }).sort((a, b) => a.localeCompare(b))) {
			const full = join(local, path);
			const stats = fs.statSync(full, { bigint: true });
			toUpload.push({ path, stats, full });
			sum += stats.size;
		}

		await io.assertYes(`Upload ${toUpload.length} files totaling ${formatBytes(sum)}?`);

		const { id } = await io.track('Creating directory', api.createDirectory(name, parent?.id));

		const dirs = new Map<string, StorageItemMetadata>();

		for (const { path, stats, full } of toUpload) {
			const { dir, base } = parse(path);

			let parentId;
			if (dir) {
				const md = dirs.get(dir);
				if (!md) throw `Could not get metadata for the directory '${dir}'.`;
				parentId = md.id;
			} else parentId = id;

			if (stats.isDirectory()) {
				dirs.set(path, await io.track('Creating directory: ' + path, api.createDirectory(base, parentId)));
			} else {
				await doUpload(full, base, stats, parentId, path);
			}
		}
		await pull();
	});

async function doDownload(item: StorageItemMetadata, local: string, text: string = local): Promise<void> {
	using _ = io.start('Downloading ' + text);
	const size = Number(item.size);
	onProgress(0, size);
	let downloaded = 0;
	const progress = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			downloaded += chunk.length;
			onProgress(downloaded, size);
			controller.enqueue(chunk);
		},
	});
	await streamWrite(local, (await api.downloadItemStream(item.id)).pipeThrough(progress), item.modifiedAt);
}

export const download = new Command('download')
	.description('Download a file or folder')
	.argument('<remote>', 'remote file or folder path to download')
	.argument('[local]', 'local path to save to')
	.option('-r, --recursive', 'operate recursively on remote folders')
	.action(async (remotePath: string, localPath: string | undefined, opts) => {
		const item = resolveItem(remotePath);
		if (!item) throw 'Could not resolve path.';
		localPath ||= item.name;

		if (item.type != 'inode/directory') {
			await doDownload(item, localPath, 'to ' + localPath);
			return;
		}

		if (!opts.recursive) throw '--recursive/-r not specified but the remote path is a folder';

		if (fs.existsSync(localPath)) throw 'File or folder exists at local path. Merging is not supported yet.';

		const items = getItems().filter(({ trashedAt }) => !trashedAt);
		const toDownload: { item: StorageItemMetadata; path: string }[] = [];
		let files = 0,
			sum = 0n;

		function collect(parentId: string, dir: string) {
			for (const child of items) {
				if (child.parentId != parentId) continue;
				const path = join(dir, child.name);
				toDownload.push({ item: child, path });
				if (child.type == 'inode/directory') collect(child.id, path);
				else {
					files++;
					sum += child.size;
				}
			}
		}

		collect(item.id, '');

		await io.assertYes(`Download ${files} files totaling ${formatBytes(sum)}?`);

		fs.mkdirSync(localPath);

		for (const { item: child, path } of toDownload) {
			const full = join(localPath, path);
			if (child.type == 'inode/directory') fs.mkdirSync(full);
			else await doDownload(child, full, path);
		}
	});
