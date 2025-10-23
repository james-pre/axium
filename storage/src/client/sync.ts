import { configDir } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import * as io from '@axium/core/node/io';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import { pick } from 'utilium';
import * as z from 'zod';
import '../polyfills.js';

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

		mkdirSync(join(configDir, 'sync'), { recursive: true });
		io.writeJSON(join(configDir, 'sync', id + '.json'), localItems);
		io.done();
		return localItems;
	} catch (e: any) {
		io.exit(e.message);
	}
}

export function getItems(id: string): LocalItem[] {
	const items = JSON.parse(readFileSync(join(configDir, 'sync', id + '.json'), 'utf-8'));
	const { error, data } = LocalItem.array().safeParse(items);

	if (error) throw z.prettifyError(error);
	return data;
}

export function setItems(id: string, items: LocalItem[]): void {
	mkdirSync(join(configDir, 'sync'), { recursive: true });
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
	localOnly: (Dirent<string> & { _path: string })[];
}

/**
 * Computes the changes between the local and remote, in the direction of the remote.
 */
export function computeDelta(id: string, localPath: string): Delta {
	const items = new Map(getItems(id).map(i => [i.path, i]));
	const itemsSet = new Set(items.keys());
	const files = new Map(
		readdirSync(localPath, { recursive: true, encoding: 'utf8', withFileTypes: true }).map(d => {
			const _path = relative(localPath, join(d.parentPath, d.name));
			return [_path, Object.assign(d, { _path })];
		})
	);

	const synced = itemsSet.intersection(files);

	const modified = new Set(
		synced.keys().filter(path => {
			const full = join(localPath, path);
			const hash = statSync(full).isDirectory() ? null : createHash('BLAKE2b512').update(readFileSync(full)).digest().toHex();
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
