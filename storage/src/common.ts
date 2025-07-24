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
	/** The maximum storage size per user in MB */
	user_size: number;
	/** The maximum size per item in MB */
	item_size: number;
	/** Maximum number of items per user */
	user_items: number;
}

export interface StorageUsage {
	bytes: number;
	items: number;
}

export interface UserFilesInfo {
	usage: StorageUsage;
	limits: StorageLimits;
	items: StorageItemMetadata[];
}

/**
 * An update to file metadata.
 */
export const StorageItemUpdate = z.object({
	owner: z.uuid().optional(),
	name: z.string().optional(),
	trash: z.boolean().optional(),
	restrict: z.boolean().optional(),
});

export type StorageItemUpdate = z.infer<typeof StorageItemUpdate>;

export interface StorageItemMetadata {
	id: string;
	ownerId: string;
	createdAt: Date;
	modifiedAt: Date;
	/** Whether editing the file is restricted to the owner */
	restricted: boolean;
	parentId: string | null;
	size: number;
	trashedAt: Date | null;
	hash: string;
	type: string;
	name: string | null;
	immutable: boolean;
	dataURL?: string;
}
