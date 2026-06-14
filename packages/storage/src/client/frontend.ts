import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/gui';
import { encodeUUID, type UUID } from 'utilium';
import { origin, text } from '@axium/client';

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
