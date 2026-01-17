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
		'storage/directory/:id/recursive': {
			GET: (StorageItemMetadata & { path: string })[];
		};
	}
}

export const StoragePublicConfig = z.object({
	/** Configuration for batch updates */
	batch: z.object({
		/** Whether to enable sending multiple files per request */
		enabled: z.boolean(),
		/** Maximum number of items that can be included in a single batch update */
		max_items: z.number(),
		/** Maximum size in KiB per item */
		max_item_size: z.number(),
	}),
	/** Whether to split files larger than `max_transfer_size` into multiple chunks */
	chunk: z.boolean(),
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: z.number(),
	/** Maximum number of chunks */
	max_chunks: z.number(),
});

export interface StoragePublicConfig extends z.infer<typeof StoragePublicConfig> {}

export const syncProtocolVersion = 0;

export const StorageLimits = z.object({
	/** The maximum size per item in MB */
	item_size: z.number(),
	/** Maximum number of items per user */
	user_items: z.number(),
	/** The maximum storage size per user in MB */
	user_size: z.number(),
});

export interface StorageLimits extends z.infer<typeof StorageLimits> {}

export interface StorageStats {
	usedBytes: number;
	itemCount: number;
	lastModified: Date;
	lastTrashed: Date | null;
}

export interface UserStorageInfo extends StorageStats {
	limits: StorageLimits;
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
	})
	.partial();

export type StorageItemUpdate = z.infer<typeof StorageItemUpdate>;

export const StorageItemMetadata = z.object({
	createdAt: z.coerce.date(),
	dataURL: z.string(),
	/** The hash of the file, or null if it is a directory */
	hash: z.string().nullish(),
	id: z.uuid(),
	immutable: z.boolean(),
	modifiedAt: z.coerce.date(),
	name: z.string(),
	userId: z.uuid(),
	parentId: z.uuid().nullable(),
	size: z.int().nonnegative(),
	trashedAt: z.coerce.date().nullable(),
	type: z.string(),
	metadata: z.record(z.string(), z.unknown()),
});

export interface StorageItemMetadata<T extends Record<string, unknown> = Record<string, unknown>>
	extends z.infer<typeof StorageItemMetadata> {
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
