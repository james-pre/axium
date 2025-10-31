import { configDir, saveConfig } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import * as io from '@axium/core/node/io';
import mime from 'mime';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { basename, dirname, join, matchesGlob, relative } from 'node:path';
import { pick } from 'utilium';
import * as z from 'zod';
import '../polyfills.js';
import { deleteItem, downloadItem, updateItem, uploadItem } from './api.js';

/**
 * A Sync is a storage item that has been selected for synchronization by the user.
 * Importantly, it is *only* the "top-level" item.
 * This means if a user selects a directory to sync, only that directory is a Sync.
 *
 * `Sync`s are client-side in nature, the server does not care about them.
 * (we could do something fancy server-side at a later date)
 */
export const Sync = z.looseObject({
	name: z.string(),
	item: z.uuid(),
	local_path: z.string(),
	last_synced: z.coerce.date(),
	remote_path: z.string(),
	include_dotfiles: z.boolean().default(false),
	exclude: z.string().array().default([]),
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
	remote_only: LocalItem[];
	items: LocalItem[];
	_items: Map<string, LocalItem>;
	/* Can't use items since they aren't tracked by Axium yet */
	local_only: (fs.Dirent<string> & { _path: string })[];
}

/**
 * Computes the changes between the local and remote, in the direction of the remote.
 */
export function computeDelta(sync: Sync): Delta {
	const items = new Map(getItems(sync.item).map(i => [i.path, i]));
	const itemsSet = new Set(items.keys());
	const files = new Map(
		fs
			.readdirSync(sync.local_path, { recursive: true, encoding: 'utf8', withFileTypes: true })
			.map(d => {
				const _path = relative(sync.local_path, join(d.parentPath, d.name));
				return [_path, Object.assign(d, { _path })] as [string, fs.Dirent & { _path: string }];
			})
			.filter(([p]) => (sync.include_dotfiles || basename(p)[0] != '.') && !sync.exclude.some(glob => matchesGlob(p, glob)))
	);

	const synced = itemsSet.intersection(files);

	const modified = new Set(
		synced.keys().filter(path => {
			const full = join(sync.local_path, path);
			const hash = fs.statSync(full).isDirectory() ? null : createHash('BLAKE2b512').update(fs.readFileSync(full)).digest().toHex();
			return hash != items.get(path)?.hash;
		})
	);

	const delta: Delta = {
		_items: items,
		items: Array.from(items.values()),
		synced: Array.from(synced.difference(modified)).map(p => items.get(p)!),
		modified: Array.from(modified).map(p => items.get(p)!),
		local_only: Array.from(new Set(files.keys()).difference(items)).map(p => files.get(p)!),
		remote_only: Array.from(itemsSet.difference(files)).map(p => items.get(p)!),
	};

	Object.defineProperty(delta, '_items', { enumerable: false });
	return delta;
}

/**
 * A helper to run an action on an array, with support for dry-runs and displaying a progress counter or listing each item.
 */
export async function applyAction<T>(
	opt: { dryRun: boolean; verbose: boolean },
	items: T[],
	label: (item: T) => string,
	action: (item: T) => Promise<void | string> | void | string
): Promise<void> {
	for (const [i, item] of items.entries()) {
		opt.verbose ? io.start(label(item)) : io.progress(i, items.length, label(item));
		try {
			let result: string | void = undefined;
			if (opt.dryRun) {
				if (opt.verbose) process.stdout.write('(dry run) ');
			} else {
				result = await action(item);
			}

			if (opt.verbose) result ? io.log(result) : io.done();
		} catch (e: any) {
			io.error(e.message);
			throw e;
		}
	}
}

export interface SyncOptions {
	delete: 'local' | 'remote' | 'none';
	dryRun: boolean;
	verbose: boolean;
}

export interface SyncStats {}

export async function doSync(sync: Sync, opt: SyncOptions): Promise<SyncStats> {
	const stats: SyncStats = {};

	await fetchSyncItems(sync.item, sync.name);
	const delta = computeDelta(sync);

	const { _items } = delta;

	if (!delta.local_only.length) {
		// Nothing
	} else if (opt.delete == 'local') {
		delta.local_only.reverse(); // so directories come after
		if (!opt.verbose) io.start('Deleting local items');
	} else if (!opt.verbose) io.start('Uploading local items');

	await applyAction(
		opt,
		delta.local_only,
		dirent => (!opt.verbose ? '' : opt.delete == 'local' ? 'Deleting local ' : 'Uploading ') + dirent._path,
		async dirent => {
			if (opt.delete == 'local') {
				fs.unlinkSync(join(sync.local_path, dirent._path));
				_items.delete(dirent._path);
				return;
			}

			const uploadOpts = {
				parentId: dirname(dirent._path) == '.' ? sync.item : _items.get(dirname(dirent._path))?.id,
				name: dirent.name,
			};

			if (dirent.isDirectory()) {
				const dir = await uploadItem(new Blob([], { type: 'inode/directory' }), uploadOpts);
				_items.set(dirent._path, Object.assign(pick(dir, 'id', 'modifiedAt'), { path: dirent._path, hash: null }));
			} else {
				const type = mime.getType(dirent._path) || 'application/octet-stream';
				const content = fs.readFileSync(join(sync.local_path, dirent._path));
				const file = await uploadItem(new Blob([content], { type }), uploadOpts);
				_items.set(dirent._path, Object.assign(pick(file, 'id', 'modifiedAt', 'hash'), { path: dirent._path }));
			}
		}
	);

	if (!delta.remote_only.length) {
		// Nothing
	} else if (opt.delete == 'remote') {
		delta.remote_only.reverse();
		if (!opt.verbose) io.start('Deleting remote items');
	} else if (!opt.verbose) io.start('Downloading remote items');

	await applyAction(
		opt,
		delta.remote_only,
		item => (!opt.verbose ? '' : opt.delete == 'remote' ? 'Deleting remote ' : 'Downloading ') + item.path,
		async item => {
			if (opt.delete == 'remote') {
				await deleteItem(item.id);
				_items.delete(item.path);
				return;
			}

			const fullPath = join(sync.local_path, item.path);
			if (!item.hash) {
				fs.mkdirSync(fullPath, { recursive: true });
			} else {
				const blob = await downloadItem(item.id);
				const content = await blob.bytes();
				fs.writeFileSync(fullPath, content);
			}
		}
	);

	if (!opt.verbose && delta.modified.length) io.start('Syncing modified items');
	await applyAction(
		opt,
		delta.modified,
		item => (opt.verbose ? 'Updating ' : '') + item.path,
		async item => {
			const type = mime.getType(item.path) || 'application/octet-stream';

			if (item.modifiedAt.getTime() > fs.statSync(join(sync.local_path, item.path)).mtime.getTime()) {
				const blob = await downloadItem(item.id);
				const content = await blob.bytes();
				fs.writeFileSync(join(sync.local_path, item.path), content);
				return 'server.';
			} else {
				const content = fs.readFileSync(join(sync.local_path, item.path));
				const updated = await updateItem(item.id, new Blob([content], { type }));
				_items.set(item.path, Object.assign(pick(updated, 'id', 'modifiedAt', 'hash'), { path: item.path }));
				return 'local.';
			}
		}
	);

	if (opt.dryRun) return stats;

	setItems(sync.item, Array.from(_items.values()));
	sync.last_synced = new Date();
	saveConfig();
	return stats;
}
