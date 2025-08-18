import type { PageLoadEvent } from './$types';
import { getDirectoryMetadata, getItemMetadata } from '@axium/storage/client';
import type { StorageItemMetadata } from '@axium/storage/common';

export const ssr = false;

export async function load({ params }: PageLoadEvent) {
	const item = await getItemMetadata(params.id);

	let items: StorageItemMetadata[] | undefined;

	if (item.type == 'inode/directory') {
		items = await getDirectoryMetadata(item.id);
	}

	return { item, items };
}
