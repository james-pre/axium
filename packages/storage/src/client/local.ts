import * as sync from '@axium/client/cli/sync';
import * as io from 'ioium/node';
import { ENOENT, ENOTDIR } from 'node:constants';
import { parse, resolve } from 'node:path';
import { StorageItemMetadata } from '../common.js';

declare module '@axium/client/cli/sync' {
	interface $Objects {
		storage: StorageItemMetadata;
	}
}

sync.useSchema('storage', StorageItemMetadata);

export let remotePWD = '/';

export function resolvePath(path: string): string {
	path = resolve(remotePWD, path);
	if (path != '/' && path.endsWith('/')) path = path.slice(0, -1);
	return path;
}

export function setRemotePWD(path: string) {
	path = resolvePath(path);
	if (path == '/') {
		remotePWD = '/';
		return;
	}
	const item = resolveItem(path);
	if (!item) throw new Error('Path not found');
	if (item.type != 'inode/directory') throw new Error('Path is not a directory');
	remotePWD = path;
}

export function walkItems(path: string): StorageItemMetadata | null {
	const items = getItems();

	let currentItem = null,
		currentParentId = null;

	const target = path.split('/').filter(p => p);

	for (const part of target) {
		currentItem = null;
		for (const item of items) {
			if (item.parentId != currentParentId || item.name != part) continue;
			currentItem = item;
			currentParentId = item.id;
			break;
		}
		if (!currentItem) return null;
	}

	return currentItem;
}

let _items: StorageItemMetadata[];

export function getItems(): StorageItemMetadata[] {
	_items ||= sync.get('storage');
	return _items;
}

export function writeItems(): void {
	sync.save('storage', _items);
}

export function resolveItem(path: string): StorageItemMetadata | null {
	path = resolvePath(path);
	return walkItems(path);
}

export function getDirectory(path: string): StorageItemMetadata[] {
	path = resolvePath(path);
	const items = sync.get('storage');
	if (path == '/') return items.filter(item => item.parentId === null);
	const dir = walkItems(path);
	if (!dir) throw ENOENT;
	if (dir.type != 'inode/directory') throw ENOTDIR;
	return items.filter(item => item.parentId === dir.id);
}

export interface ResolvedWithParent {
	parent: StorageItemMetadata | null;
	dir: string;
	name: string;
}

/**
 * Resolve the name, directory path, and parent metadata for a given path.
 */
export function resolvePathWithParent(path: string): ResolvedWithParent {
	const { dir, base: name } = parse(path);
	const parent = resolveItem(dir);
	if (dir) {
		if (!parent) io.exit('Could not resolve parent folder.');
		if (parent.type != 'inode/directory') io.exit('Parent path is not a directory.');
	}
	if (!name) io.exit('Invalid path.');
	return { parent, dir, name };
}
