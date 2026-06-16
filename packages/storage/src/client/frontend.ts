import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/gui';
import { encodeUUID, type UUID } from 'utilium';
import { origin, text } from '@axium/client';
import { createDirectory, createItemFromFile, updateItemMetadata } from './api.js';

function shortURL(id: string): string {
	return new URL('/f/' + encodeUUID(id as UUID).toBase64({ alphabet: 'base64url', omitPadding: true }), location.origin).href;
}

export function copyShortURL(...ids: string[]): Promise<void> {
	return copy('text/plain', ids.map(shortURL).join(', '));
}

/**
 * Formats an item name
 */
export function formatItemName(item?: { name?: string | null } | null) {
	if (!item?.name) return text('storage.generic.no_name_in_dialog');
	return item.name.length > 23 ? item.name.slice(0, 20) + '...' : item.name;
}

export function _downloadItem(item?: StorageItemMetadata) {
	if (!item) throw text('storage.generic.no_item');
	open(new URL(item.type != 'inode/directory' ? item.dataURL : '/raw/storage/directory-zip/' + item.id, origin), '_blank');
}

/**
 * Download multiple items together as a single ZIP file.
 */
export function _downloadItems(...ids: string[]) {
	if (!ids.length) throw text('storage.generic.no_item');

	const url = new URL('/raw/storage/directory-zip', origin);
	url.searchParams.set('ids', ids.join(','));
	open(url, '_blank');
}

/**
 * Recursively upload a list of drag-and-drop filesystem entries into the folder identified by `parentId`.
 */
export async function uploadEntries(
	entries: Iterable<FileSystemEntry>,
	parentId: string | null | undefined,
	onItem?: (item: StorageItemMetadata) => void
): Promise<void> {
	parentId ??= undefined;
	for (const entry of entries) {
		if (entry.isDirectory) {
			const dir = await createDirectory(entry.name, parentId);
			onItem?.(dir);
			const reader = (entry as FileSystemDirectoryEntry).createReader();

			const read = () => new Promise(reader.readEntries.bind(reader));
			for (let batch = await read(); batch.length; batch = await read()) await uploadEntries(batch, dir.id);
		} else {
			const file = await new Promise((entry as FileSystemFileEntry).file.bind(entry));
			const item = await createItemFromFile(file, { parentId });
			onItem?.(item);
		}
	}
}

/**
 * Move the given items into the folder identified by `parentId` (or the root when `null`).
 *
 * The destination is skipped if it is among the moved items, since a folder can not be moved into itself.
 * Returns the ids that were actually moved.
 */
export async function moveItems(ids: string[], parentId: string | null): Promise<string[]> {
	const toMove = ids.filter(id => id != parentId);
	await Promise.all(toMove.map(id => updateItemMetadata(id, { parentId })));
	return toMove;
}
