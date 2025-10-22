import type { StorageItemMetadata } from '../common.js';

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
