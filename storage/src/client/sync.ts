import { configDir, saveConfig } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import * as io from '@axium/core/node/io';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pick } from 'utilium';
import * as z from 'zod';
import '../polyfills.js';
import { deleteItem, downloadItem, updateItem, uploadItem } from './api.js';
import mime from 'mime';

/**
 * A Sync is a storage item that has been selected for synchronization by the user.
 * Importantly, it is *only* the "top-level" item.
 * This means if a user selects a directory to sync, only that directory is a Sync.
 *
 * `Sync`s are client-side in nature, the server does not care about them.
 * (we could do something fancy server-side at a later date)
 */
export const Sync = z.object({
	name: z.string(),
	itemId: z.uuid(),
	localPath: z.string(),
	lastSynced: z.coerce.date(),
	remotePath: z.string(),
});

export interface Sync extends z.infer<typeof Sync> {}

/** Local metadata about a storage item to sync */
export const LocalItem = z.object({
	id: z.uuid(),
	path: z.string(),
	modifiedAt: z.coerce.date(),
	hash: z.hex().length(128).nullish(),
});

export interface LocalItem extends z.infer<typeof LocalItem> {}

export async function fetchSyncItems(id: string, folderName?: string): Promise<LocalItem[]> {
	io.start('Fetching ' + (folderName ?? id));
	try {
		const items = await fetchAPI('GET', 'storage/directory/:id/recursive', null, id);

		const localItems = items.map(item => pick(item, 'id', 'path', 'modifiedAt', 'hash')) satisfies LocalItem[];

		fs.mkdirSync(join(configDir, 'sync'), { recursive: true });
		io.writeJSON(join(configDir, 'sync', id + '.json'), localItems);
		io.done();
		return localItems;
	} catch (e: any) {
		io.exit(e.message);
	}
}

export function getItems(id: string): LocalItem[] {
	const items = JSON.parse(fs.readFileSync(join(configDir, 'sync', id + '.json'), 'utf-8'));
	const { error, data } = LocalItem.array().safeParse(items);

	if (error) throw z.prettifyError(error);
	return data;
}

export function setItems(id: string, items: LocalItem[]): void {
	fs.mkdirSync(join(configDir, 'sync'), { recursive: true });
	io.writeJSON(join(configDir, 'sync', id + '.json'), items);
}

/** Metadata about a synced storage item. */
export interface ItemMetadata {}

/** Computed metadata about changes */
export interface Delta {
	synced: LocalItem[];
	modified: LocalItem[];
	remoteOnly: LocalItem[];
	items: LocalItem[];
	_items: Map<string, LocalItem>;
	/* Can't use items since they aren't tracked by Axium yet */
	localOnly: (fs.Dirent<string> & { _path: string })[];
}

/**
 * Computes the changes between the local and remote, in the direction of the remote.
 */
export function computeDelta(id: string, localPath: string): Delta {
	const items = new Map(getItems(id).map(i => [i.path, i]));
	const itemsSet = new Set(items.keys());
	const files = new Map(
		fs.readdirSync(localPath, { recursive: true, encoding: 'utf8', withFileTypes: true }).map(d => {
			const _path = relative(localPath, join(d.parentPath, d.name));
			return [_path, Object.assign(d, { _path })];
		})
	);

	const synced = itemsSet.intersection(files);

	const modified = new Set(
		synced.keys().filter(path => {
			const full = join(localPath, path);
			const hash = fs.statSync(full).isDirectory() ? null : createHash('BLAKE2b512').update(fs.readFileSync(full)).digest().toHex();
			return hash != items.get(path)?.hash;
		})
	);

	const delta = {
		_items: items,
		items: Array.from(items.values()),
		synced: Array.from(synced.difference(modified)).map(p => items.get(p)!),
		modified: Array.from(modified).map(p => items.get(p)!),
		localOnly: Array.from(new Set(files.keys()).difference(items)).map(p => files.get(p)!),
		remoteOnly: Array.from(itemsSet.difference(files)).map(p => items.get(p)!),
	};

	Object.defineProperty(delta, '_items', { enumerable: false });
	return delta;
}

export interface SyncOptions {
	delete: 'local' | 'remote' | 'none';
	dryRun: boolean;
}

export async function doSync(sync: Sync, opt: SyncOptions): Promise<void> {
	await fetchSyncItems(sync.itemId, sync.name);
	const delta = computeDelta(sync.itemId, sync.localPath);

	const { _items } = delta;

	if (opt.delete == 'local') delta.localOnly.reverse(); // so directories come after
	for (const dirent of delta.localOnly) {
		if (opt.delete == 'local') {
			io.start('Deleting ' + dirent._path);
			try {
				if (opt.dryRun) process.stdout.write('(dry run) ');
				else {
					fs.unlinkSync(join(sync.localPath, dirent._path));
					_items.delete(dirent._path);
				}
				io.done();
			} catch (e: any) {
				io.error(e.message);
			}
			continue;
		}

		const uploadOpts = {
			parentId: dirname(dirent._path) == '.' ? sync.itemId : _items.get(dirname(dirent._path))?.id,
			name: dirent.name,
		};
		io.start('Uploading ' + dirent._path);
		try {
			if (opt.dryRun) process.stdout.write('(dry run) ');
			else if (dirent.isDirectory()) {
				const dir = await uploadItem(new Blob([], { type: 'inode/directory' }), uploadOpts);
				_items.set(dirent._path, Object.assign(pick(dir, 'id', 'modifiedAt'), { path: dirent._path, hash: null }));
			} else {
				const type = mime.getType(dirent._path) || 'application/octet-stream';
				const content = fs.readFileSync(join(sync.localPath, dirent._path));
				const file = await uploadItem(new Blob([content], { type }), uploadOpts);
				_items.set(dirent._path, Object.assign(pick(file, 'id', 'modifiedAt', 'hash'), { path: dirent._path }));
			}
			io.done();
		} catch (e: any) {
			io.error(e.message);
		}
	}

	if (opt.delete == 'remote') delta.remoteOnly.reverse();
	for (const item of delta.remoteOnly) {
		if (opt.delete == 'remote') {
			io.start('Deleting ' + item.path);
			try {
				if (opt.dryRun) process.stdout.write('(dry run) ');
				else {
					await deleteItem(item.id);
					_items.delete(item.path);
				}
				io.done();
			} catch (e: any) {
				io.error(e.message);
			}
			continue;
		}

		io.start('Downloading ' + item.path);
		try {
			const fullPath = join(sync.localPath, item.path);
			if (opt.dryRun) process.stdout.write('(dry run) ');
			else if (!item.hash) {
				fs.mkdirSync(fullPath, { recursive: true });
			} else {
				const blob = await downloadItem(item.id);
				const content = await blob.bytes();

				fs.writeFileSync(fullPath, content);
			}
			io.done();
		} catch (e: any) {
			io.error(e.message);
		}
	}

	for (const item of delta.modified) {
		io.start('Updating ' + item.path);

		try {
			const content = fs.readFileSync(join(sync.localPath, item.path));
			const type = mime.getType(item.path) || 'application/octet-stream';

			if (item.modifiedAt.getTime() > fs.statSync(join(sync.localPath, item.path)).mtime.getTime()) {
				if (opt.dryRun) process.stdout.write('(dry run) ');
				else {
					const blob = await downloadItem(item.id);
					const content = await blob.bytes();
					fs.writeFileSync(join(sync.localPath, item.path), content);
				}
				console.log('server.');
			} else {
				if (opt.dryRun) process.stdout.write('(dry run) ');
				else {
					const updated = await updateItem(item.id, new Blob([content], { type }));
					_items.set(item.path, Object.assign(pick(updated, 'id', 'modifiedAt', 'hash'), { path: item.path }));
				}
				console.log('local.');
			}
		} catch (e: any) {
			io.error(e.message);
		}
	}

	if (opt.dryRun) return;

	setItems(sync.itemId, Array.from(_items.values()));
	sync.lastSynced = new Date();
	saveConfig();
}
