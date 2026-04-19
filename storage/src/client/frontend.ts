import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/gui';
import { encodeUUID, type UUID } from 'utilium';
import { getOrigin, text } from '@axium/client';

export function copyShortURL(item: StorageItemMetadata): Promise<void> {
	const { href } = new URL('/f/' + encodeUUID(item.id as UUID).toBase64({ alphabet: 'base64url', omitPadding: true }), location.origin);
	return copy('text/plain', href);
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
	open(new URL(item.type != 'inode/directory' ? item.dataURL : '/raw/storage/directory-zip/' + item.id, getOrigin()), '_blank');
}
