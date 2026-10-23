import { $API, AccessControl, appPreferences, serverConfigs } from '@axium/core';
import type {} from '@axium/core/apps';
import { UploadConfig, UploadInit, UploadName, UploadSize } from '@axium/core/uploads';
import * as locales from '@james-pre/locales';
import * as z from 'zod';
import { SyncRule } from './rules.js';

export const StorageSyncSettings = z
	.object({
		rules: SyncRule.array(),
		/** Whether the folder is left out of the root of Files */
		hidden: z.boolean(),
	})
	.register(locales.zod, { prefix: 'storage.sync_settings' });

export interface StorageSyncSettings extends z.infer<typeof StorageSyncSettings> {}

export const StorageSyncDeviceInit = z.object({
	host: z.string().nonempty().max(255),
	localPath: z.string().nonempty(),
	lastSynced: z.coerce.date().nullable(),
});

export interface StorageSyncDeviceInit extends z.infer<typeof StorageSyncDeviceInit> {}

export const StorageSyncDevice = StorageSyncDeviceInit.extend({
	itemId: z.uuid(),
	userId: z.uuid(),
});

export interface StorageSyncDevice extends z.infer<typeof StorageSyncDevice> {}

/** A folder being synced with local folders on devices. */
export const StorageSync = StorageSyncSettings.extend({
	itemId: z.uuid(),
	createdAt: z.coerce.date(),
	devices: StorageSyncDevice.array(),
});

export interface StorageSync extends z.infer<typeof StorageSync> {}

/**
 * An update to file metadata.
 */
export const StorageItemUpdate = z
	.object({
		name: UploadName,
		owner: z.uuid(),
		trash: z.boolean(),
		parentId: z.uuid().nullable(),
	})
	.partial();

export type StorageItemUpdate = z.infer<typeof StorageItemUpdate>;

export const GetItemOptions = z
	.object({
		parents: z.boolean(),
	})
	.partial();
export interface GetItemOptions extends z.infer<typeof GetItemOptions> {}

export const GetDirectoryOptions = z
	.object({
		sync: z.boolean(),
	})
	.partial();
export interface GetDirectoryOptions extends z.infer<typeof GetDirectoryOptions> {}

export const StorageItemMetadata = z.object({
	createdAt: z.coerce.date(),
	dataURL: z.string(),
	/** The hash of the file, or null if it is a directory */
	hash: z.string().nullish(),
	id: z.uuid(),
	immutable: z.boolean(),
	modifiedAt: z.coerce.date(),
	name: UploadName,
	userId: z.uuid(),
	parentId: z.uuid().nullable(),
	size: UploadSize,
	trashedAt: z.coerce.date().nullable(),
	type: z.string(),
	metadata: z.record(z.string(), z.unknown()),
	acl: AccessControl.array().optional(),
	parents: z.object({ id: z.uuid(), name: z.string() }).array().optional(),
	/** Present when requested and the item is a synced folder */
	sync: StorageSync.omit({ itemId: true }).nullish(),
});

export interface StorageItemMetadata<T extends Record<string, unknown> = Record<string, unknown>> extends z.infer<
	typeof StorageItemMetadata
> {
	metadata: T;
}

export const StorageItemSorting = z.object({
	descending: z.boolean().optional(),
	by: z.literal(['createdAt', 'modifiedAt', 'name', 'size'] satisfies (keyof StorageItemMetadata)[]),
});
export interface StorageItemSorting extends z.infer<typeof StorageItemSorting> {}

export const syncProtocolVersion = 0;

export const StorageLimits = z.object({
	/** The maximum size per item in MB */
	item_size: z.int().nonnegative(),
	/** Maximum number of items per user */
	user_items: z.int().nonnegative(),
	/** The maximum storage size per user in MB */
	user_size: z.coerce.bigint().nonnegative(),
});

export interface StorageLimits extends z.infer<typeof StorageLimits> {}

export const StorageStats = z.object({
	usedBytes: z.coerce.bigint().nonnegative(),
	itemCount: z.int().nonnegative(),
	fileCount: z.int().nonnegative(),
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

export const UserStorageOptions = z
	.object({
		sort: StorageItemSorting,
	})
	.partial()
	.default({});
export interface UserStorageOptions extends z.infer<typeof UserStorageOptions> {}

export const StoragePreferences = z
	.object({
		sort_folders_first: z.boolean().default(true),
		/** Whether to show the full path in usage and trash */
		full_path_in_special: z.boolean().default(true),
		/** Whether to open files with a single click instead of a double click */
		open_with_single_click: z.boolean().default(false),
		/** Whether to start uploading immediately after files are selected, instead of waiting for the upload button */
		upload_on_select: z.boolean().default(false),
		/** Whether to ask for confirmation before moving items */
		confirm_move: z.boolean().default(true),
		/** Whether to ask for confirmation before permanently deleting items */
		confirm_delete: z.boolean().default(true),
	})
	.register(locales.zod, { prefix: 'storage.preferences' });

appPreferences.set('files', StoragePreferences);

declare module '@axium/core/apps' {
	interface $AppPreferences {
		files: typeof StoragePreferences;
	}
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
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: z.int().positive(),
});

export interface StoragePublicConfig extends z.infer<typeof StoragePublicConfig> {}

export const StorageConfig = StoragePublicConfig.safeExtend({
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
	upload: UploadConfig,
	/** Path to data directory */
	data: z.string(),
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

serverConfigs.set('@axium/storage', StorageConfig);

export const StorageItemInit = z.object({
	...UploadInit.shape,
	parentId: z.uuid().nullish(),
	/** Defaults to the time the upload finishes */
	modifiedAt: z.coerce.date().optional(),
});

export interface StorageItemInit extends z.infer<typeof StorageItemInit> {}

export const StorageContentUpdate = z.object({
	size: UploadSize,
	/** Defaults to the time the upload finishes */
	modifiedAt: z.coerce.date().optional(),
});

export interface StorageContentUpdate extends z.infer<typeof StorageContentUpdate> {}

export const UploadInitResult = z.discriminatedUnion('status', [
	StoragePublicConfig.safeExtend({
		status: z.literal('accepted'),
		/** Used for chunked uploads */
		token: z.base64url(),
	}),
	z.object({
		status: z.literal('created'),
		item: StorageItemMetadata,
	}),
]);

export type UploadInitResult = z.infer<typeof UploadInitResult>;

export const StorageSyncInfo = StorageSync.extend({
	item: StorageItemMetadata,
	usage: z.object({
		/** In bytes */
		size: z.coerce.bigint(),
		items: z.int().nonnegative(),
	}),
});

export interface StorageSyncInfo extends z.infer<typeof StorageSyncInfo> {}

const StorageAPI = {
	'users/:id/storage': {
		OPTIONS: UserStorageInfo,
		GET: [UserStorageOptions, UserStorage],
	},
	'users/:id/storage/usage': {
		GET: UserStorage,
	},
	'users/:id/storage/root': {
		GET: [GetDirectoryOptions, StorageItemMetadata.array()],
	},
	'users/:id/storage/trash': {
		GET: StorageItemMetadata.array(),
		DELETE: z.int().nonnegative(),
	},
	'users/:id/storage/syncs': {
		GET: StorageSyncInfo.array(),
	},
	'users/:id/storage/shared': {
		GET: StorageItemMetadata.array(),
	},
	storage: {
		OPTIONS: StoragePublicConfig.extend({
			syncProtocolVersion: z.int32().nonnegative(),
			batchFormatVersion: z.int32().nonnegative(),
		}),
		PUT: [StorageItemInit, UploadInitResult],
	},
	'storage/batch': {
		POST: [StorageBatchUpdate.array(), StorageItemMetadata.array()],
	},
	'storage/item/:id': {
		GET: [GetItemOptions, StorageItemMetadata],
		DELETE: StorageItemMetadata,
		PATCH: [StorageItemUpdate, StorageItemMetadata],
		POST: [StorageContentUpdate, UploadInitResult],
	},
	'storage/directory/:id': {
		GET: [GetDirectoryOptions, StorageItemMetadata.array()],
	},
	'storage/directory/:id/recursive': {
		GET: StorageItemMetadata.extend({ path: z.string() }).array(),
	},
	'storage/sync/:id': {
		GET: StorageSync,
		PUT: [StorageSyncSettings.partial(), StorageSync],
		PATCH: [StorageSyncSettings.partial(), StorageSync],
		DELETE: StorageSync,
	},
	'storage/sync/:id/device': {
		PUT: [StorageSyncDeviceInit, StorageSyncDevice],
		DELETE: [StorageSyncDeviceInit.pick({ host: true }), StorageSyncDevice],
	},
} as const;

type StorageAPI = typeof StorageAPI;

declare module '@axium/core/api' {
	export interface $API extends StorageAPI {}
}

Object.assign($API, StorageAPI);
