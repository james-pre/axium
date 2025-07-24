import * as z from 'zod';

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/storage': {
			OPTIONS: { usage: StorageUsage; limits: StorageLimits };
			GET: UserFilesInfo;
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

export interface UserFilesInfo {
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
		restrict: z.boolean(),
		visibility: z.boolean(),
	})
	.partial();

export type StorageItemUpdate = z.infer<typeof StorageItemUpdate>;

export interface StorageItemMetadata {
	createdAt: Date;
	dataURL?: string;
	hash: string;
	id: string;
	immutable: boolean;
	modifiedAt: Date;
	name: string;
	userId: string;
	parentId: string | null;
	/** Whether editing the file is restricted to the owner */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	type: string;
	visibility: number;
}
