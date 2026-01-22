import { $API, setServerConfig } from '@axium/core';
import * as z from 'zod';

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

export interface StorageItemMetadata<T extends Record<string, unknown> = Record<string, unknown>> extends z.infer<
	typeof StorageItemMetadata
> {
	metadata: T;
}

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

export const StorageStats = z.object({
	usedBytes: z.number().nonnegative(),
	itemCount: z.number().nonnegative(),
	lastModified: z.coerce.date(),
	lastTrashed: z.coerce.date().nullable(),
});

export interface StorageStats extends z.infer<typeof StorageStats> {}

export const UserStorageInfo = z.object({
	...StorageStats.shape,
	limits: StorageLimits,
});

export interface UserStorageInfo extends z.infer<typeof UserStorageInfo> {}

export const UserStorage = z.object({
	...UserStorageInfo.shape,
	items: StorageItemMetadata.array(),
});

export interface UserStorage extends z.infer<typeof UserStorage> {}

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

export const StoragePublicConfig = z.object({
	/** Configuration for batch updates */
	batch: z.object({
		/** Whether to enable sending multiple files per request */
		enabled: z.boolean(),
		/** Maximum number of items that can be included in a single batch update */
		max_items: z.int().positive(),
		/** Maximum size in KiB per item */
		max_item_size: z.int().positive(),
	}),
	/** Whether to split files larger than `max_transfer_size` into multiple chunks */
	chunk: z.boolean(),
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: z.int().positive(),
	/** Maximum number of chunks */
	max_chunks: z.int().positive(),
});

export interface StoragePublicConfig extends z.infer<typeof StoragePublicConfig> {}

export const StorageConfig = StoragePublicConfig.safeExtend({
	/** Whether the files app is enabled. Requires `enabled` */
	app_enabled: z.boolean(),
	/** Content Addressable Storage (CAS) configuration */
	cas: z
		.object({
			/** Whether to use CAS */
			enabled: z.boolean(),
			/** Mime types to include when determining if CAS should be used */
			include: z.string().array(),
			/** Mime types to exclude when determining if CAS should be used */
			exclude: z.string().array(),
		})
		.partial(),
	/** Path to data directory */
	data: z.string(),
	/** Whether the storage API endpoints are enabled */
	enabled: z.boolean(),
	/** Default limits */
	limits: StorageLimits,
	/** How many days files are kept in the trash */
	trash_duration: z.number(),
});

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/storage': z.infer<typeof StorageConfig>;
	}
}

setServerConfig('@axium/storage', StorageConfig);

const StorageAPI = {
	'users/:id/storage': {
		OPTIONS: UserStorageInfo,
		GET: UserStorage,
	},
	'users/:id/storage/root': {
		GET: StorageItemMetadata.array(),
	},
	'users/:id/storage/trash': {
		GET: StorageItemMetadata.array(),
	},
	'users/:id/storage/shared': {
		GET: StorageItemMetadata.array(),
	},
	storage: {
		OPTIONS: StoragePublicConfig.extend({
			syncProtocolVersion: z.number(),
			batchFormatVersion: z.number(),
		}),
	},
	'storage/batch': {
		POST: [StorageBatchUpdate.array(), StorageItemMetadata.array()],
	},
	'storage/item/:id': {
		GET: StorageItemMetadata,
		DELETE: StorageItemMetadata,
		PATCH: [StorageItemUpdate, StorageItemMetadata],
	},
	'storage/directory/:id': {
		GET: StorageItemMetadata.array(),
	},
	'storage/directory/:id/recursive': {
		GET: StorageItemMetadata.extend({ path: z.string() }).array(),
	},
} as const;

type StorageAPI = typeof StorageAPI;

declare module '@axium/core/api' {
	export interface $API extends StorageAPI {}
}

Object.assign($API, StorageAPI);
