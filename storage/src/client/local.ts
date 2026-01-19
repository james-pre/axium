import { cacheDir, session } from '@axium/client/cli/config';
import { userInfo } from '@axium/client/user';
import { UserPublic } from '@axium/core';
import * as io from '@axium/core/node/io';
import { ENOENT, ENOTDIR } from 'node:constants';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { StorageItemMetadata } from '../common.js';
import { getUserStats, getUserStorage } from './api.js';

let quiet = false;

export function setQuiet(enabled: boolean) {
	quiet = enabled;
}

export function walkItems(path: string, items: StorageItemMetadata[]): StorageItemMetadata | null {
	const resolved: string[] = [];
	let currentItem = null,
		currentParentId = null;

	const target = path.split('/').filter(p => p);

	for (const part of target) {
		for (const item of items) {
			if (item.parentId != currentParentId || item.name != part) continue;
			currentItem = item;
			currentParentId = item.id;
			resolved.push(part);
			break;
		}
	}

	return currentItem;
}

const StorageCache = z.object({
	items: StorageItemMetadata.array(),
	users: z.record(z.uuid(), UserPublic),
});

interface StorageCache extends z.infer<typeof StorageCache> {
	users: Record<string, UserPublic>;
}

export const cachePath = join(cacheDir, 'storage.json');

export let cachedData: StorageCache | null = null;

/**
 * @param force true => always refresh, false => never refresh, null (default) => refresh if outdated
 */
export async function syncCache(force: boolean | null = null): Promise<StorageCache> {
	if (cachedData) return cachedData;

	const cacheUpdated = await stat(cachePath)
		.then(stats => stats.mtimeMs)
		.catch(() => 0);

	const { userId } = session();

	let { lastModified, lastTrashed } = await getUserStats(userId);
	lastTrashed ??= new Date(0);

	if ((force || cacheUpdated < lastModified.getTime() || cacheUpdated < lastTrashed.getTime()) && force !== false) {
		if (!quiet) io.start('Updating and loading item metadata');
		try {
			const { items } = await getUserStorage(userId);
			const users: Record<string, UserPublic> = {};
			for (const item of items) {
				users[item.userId] ||= await userInfo(item.userId);
			}
			cachedData = { items, users };
			io.writeJSON(cachePath, cachedData);
			if (!quiet) io.done();
		} catch (e) {
			if (quiet) io.exit('Failed to update item metadata: ' + io.errorText(e));
			else io.exit(e);
		}
	} else {
		cachedData = io.readJSON(cachePath, StorageCache);
	}

	return cachedData;
}

export async function resolveItem(path: string): Promise<StorageItemMetadata | null> {
	const { items } = await syncCache();
	return walkItems(path, items);
}

export async function getDirectory(path: string): Promise<StorageItemMetadata[]> {
	const { items } = await syncCache();
	if (path == '/' || path == '') return items.filter(item => item.parentId === null);
	const dir = walkItems(path, items);
	if (!dir) throw ENOENT;
	if (dir.type != 'inode/directory') throw ENOTDIR;
	return items.filter(item => item.parentId === dir.id);
}
