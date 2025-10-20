import * as z from 'zod';

/**
 * A Sync is a storage item that has been selected for synchronization by the user.
 * Importantly, it is *only* the "top-level" item.
 * This means if a user selects a directory to sync, only that directory is a Sync.
 *
 * `Sync`s are client-side in nature, the server does not care about them.
 * (we could do something fancy server-side at a later date)
 */
export interface Sync {
	itemId: string;
}

/** Local metadata about a storage item to sync */
export const LocalItem = z.object({
	id: z.uuid(),
	path: z.string(),
	lastModified: z.date().nullish(),
	lastSynced: z.date(),
	hash: z.string(),
});

/** Metadata about a synced storage item. */
export interface ItemMetadata {}

/** Computed metadata about changes */
export interface Delta {}

export function computeDelta(from: ItemMetadata, to: ItemMetadata): Delta {
	return {};
}
