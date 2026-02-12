import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/clipboard';
import { encodeUUID, type UUID } from 'utilium';

export function copyShortURL(item: StorageItemMetadata): Promise<void> {
	const { href } = new URL('/f/' + encodeUUID(item.id as UUID).toBase64({ alphabet: 'base64url', omitPadding: true }), location.origin);
	return copy('text/plain', href);
}
