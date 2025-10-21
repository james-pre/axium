import * as z from 'zod';

declare module '@axium/core/api' {
	export interface $API {
		'users/:id/storage': {
			OPTIONS: UserStorageInfo;
			GET: UserStorage;
		};
		'users/:id/storage/root': {
			GET: StorageItemMetadata[];
		};
		'users/:id/storage/trash': {
			GET: StorageItemMetadata[];
		};
		'users/:id/storage/shared': {
			GET: StorageItemMetadata[];
		};
		storage: {
			OPTIONS: StoragePublicConfig & {
				syncProtocolVersion: number;
				batchFormatVersion: number;
			};
		};
		'storage/batch': {
			POST: [StorageBatchUpdate[], StorageItemMetadata[]];
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

export interface StoragePublicConfig {
	/** Configuration for batch updates */
	batch: {
		/** Whether to enable sending multiple files per request */
		enabled: boolean;
		/** Maximum number of items that can be included in a single batch update */
		max_items: number;
		/** Maximum size in KiB per item */
		max_item_size: number;
	};
	/** Whether to split files larger than `max_transfer_size` into multiple chunks */
	chunk: boolean;
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: number;
	/** Maximum number of chunks */
	max_chunks: number;
}

export const syncProtocolVersion = 0;

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
	limits: StorageLimits;
	usage: StorageUsage;
}

export interface UserStorage extends UserStorageInfo {
	items: StorageItemMetadata[];
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

/**
 * Formats:
 *
 * **v0**:
 * - Metadata transferred using JSON
 * - `x-batch-header-size` HTTP header used to determine batch header size
 * - Binary data appended after batch header
 */
export const batchFormatVersion = 0;

export const BatchedContentChange = z.object({
	/** Offset in request body */
	offset: z.int().nonnegative(),
	size: z.int().nonnegative(),
});

export const StorageBatchUpdate = z.object({
	deleted: z.uuid().array(),
	metadata: z.record(z.uuid(), StorageItemUpdate),
	content: z.record(z.uuid(), BatchedContentChange),
});

export interface StorageBatchUpdate extends z.infer<typeof StorageBatchUpdate> {}
