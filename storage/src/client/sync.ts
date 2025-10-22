import { configDir } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import * as io from '@axium/core/node/io';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pick } from 'utilium';
import * as z from 'zod';

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
	hash: z.hex().length(128),
});

export interface LocalItem extends z.infer<typeof LocalItem> {}

export async function fetchSyncItems(id: string, folderName?: string): Promise<void> {
	io.start('Fetching ' + (folderName ?? id));
	try {
		const items = await fetchAPI('GET', 'storage/directory/:id/recursive', null, id);

		const localItems = items.map(item => pick(item, 'id', 'path', 'hash', 'modifiedAt'));

		mkdirSync(join(configDir, 'sync'), { recursive: true });
		io.writeJSON(join(configDir, 'sync', id + '.json'), localItems);
	} catch (e: any) {
		io.exit(e.message);
	}

	io.done();
}

export function getItems(id: string): LocalItem[] {
	const items = JSON.parse(readFileSync(join(configDir, 'sync', id + '.json'), 'utf-8'));
	const { error, data } = LocalItem.array().safeParse(items);

	if (error) throw z.prettifyError(error);
	return data;
}

/** Metadata about a synced storage item. */
export interface ItemMetadata {}

/** Computed metadata about changes */
export interface Delta {
	synced: LocalItem[];
	modified: LocalItem[];
	deleted: LocalItem[];
	items: LocalItem[];
	/* Can't use items since they aren't tracked by Axium yet */
	added: string[];
}

export function computeDelta(id: string, localPath: string): Delta {
	const items = new Map(getItems(id).map(i => [i.path, i]));
	const itemsSet = new Set(items.keys());
	const files = new Set(readdirSync(localPath, { recursive: true, encoding: 'utf8' }));

	const synced = itemsSet.intersection(files);

	const modified = new Set(
		synced.keys().filter(path => createHash('BLAKE2b512').update(readFileSync(path)).digest().toHex() != items.get(path)?.hash)
	);

	return {
		items: Array.from(items.values()),
		synced: Array.from(synced.difference(modified)).map(p => items.get(p)!),
		modified: Array.from(modified).map(p => items.get(p)!),
		added: Array.from(files.difference(items)),
		deleted: Array.from(itemsSet.difference(files)).map(p => items.get(p)!),
	};
}
