import * as z from 'zod';

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/storage': {
			OPTIONS: { usage: StorageUsage; limits: StorageLimits };
			GET: UserStorageInfo;
		};
		'users/:id/storage/root': {
			GET: StorageItemMetadata[];
		};
		'users/:id/storage/trash': {
			GET: StorageItemMetadata[];
		};
		'storage/item/:id': {
			GET: StorageItemMetadata;
			DELETE: StorageItemMetadata;
			PATCH: [z.input<typeof StorageItemUpdate>, StorageItemMetadata];
		};
		'storage/directory/:id': {
			GET: StorageItemMetadata[];
		};
	}
}

export interface StorageLimits {
	/** The maximum size per item in MB */
	item_size: number;
	/** Maximum number of items per user */
	user_items: number;
	/** The maximum storage size per user in MB */
	user_size: number;
}

export interface StorageUsage {
	bytes: number;
	items: number;
}

export interface UserStorageInfo {
	items: StorageItemMetadata[];
	limits: StorageLimits;
	usage: StorageUsage;
}

/**
 * An update to file metadata.
 */
export const StorageItemUpdate = z
	.object({
		name: z.string(),
		owner: z.uuid(),
		trash: z.boolean(),
		publicPermission: z.number().min(0).max(5),
	})
	.partial();

export type StorageItemUpdate = z.infer<typeof StorageItemUpdate>;

export interface StorageItemMetadata<T extends Record<string, unknown> = Record<string, unknown>> {
	createdAt: Date;
	dataURL: string;
	/** The hash of the file, or null if it is a directory */
	hash: string | null;
	id: string;
	immutable: boolean;
	modifiedAt: Date;
	name: string;
	userId: string;
	parentId: string | null;
	publicPermission: number;
	size: number;
	trashedAt: Date | null;
	type: string;
	metadata: T;
}
