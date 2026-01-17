import { Severity } from '@axium/core';
import { addEvent } from '@axium/server/audit';
import { addConfigDefaults, config } from '@axium/server/config';
import type { StorageLimits, StoragePublicConfig } from '../common.js';
import '../polyfills.js';

declare module '@axium/server/config' {
	export interface Config {
		storage: StoragePublicConfig & {
			/** Whether the files app is enabled. Requires `enabled` */
			app_enabled: boolean;
			/** Content Addressable Storage (CAS) configuration */
			cas: {
				/** Whether to use CAS */
				enabled: boolean;
				/** Mime types to include when determining if CAS should be used */
				include: string[];
				/** Mime types to exclude when determining if CAS should be used */
				exclude: string[];
			};
			/** Path to data directory */
			data: string;
			/** Whether the storage API endpoints are enabled */
			enabled: boolean;
			/** Default limits */
			limits: StorageLimits;
			/** How many days files are kept in the trash */
			trash_duration: number;
		};
	}
}

export const defaultCASMime = [/video\/.*/, /audio\/.*/];

addConfigDefaults({
	storage: {
		app_enabled: true,
		batch: {
			enabled: false,
			max_items: 100,
			max_item_size: 100,
		},
		cas: {
			enabled: true,
			include: [],
			exclude: [],
		},
		chunk: false,
		data: '/srv/axium/storage',
		enabled: true,
		limits: {
			user_size: 1000,
			item_size: 100,
			user_items: 10_000,
		},
		max_chunks: 10,
		max_transfer_size: 100,
		trash_duration: 30,
	},
});

declare module '@axium/server/audit' {
	export interface $EventTypes {
		storage_type_mismatch: {
			/** The ID of the target item */
			item: string;
		};
		/** Mismatch between the actual size of an upload and the size reported in the header */
		storage_size_mismatch: {
			/** ID of the target item, null for new uploads */
			item: string | null;
		};
	}
}

addEvent({
	source: '@axium/storage',
	name: 'storage_type_mismatch',
	severity: Severity.Warning,
	tags: ['mimetype'],
	extra: { item: z.string() },
});
addEvent({
	source: '@axium/storage',
	name: 'storage_size_mismatch',
	severity: Severity.Warning,
	tags: [],
	extra: { item: z.string().nullable() },
});

export type ExternalLimitHandler = (userId?: string) => StorageLimits | Promise<StorageLimits>;

let _getLimits: ExternalLimitHandler | null = null;

/**
 * Define the handler to get limits for a user externally.
 */
export function useLimits(handler: ExternalLimitHandler): void {
	_getLimits = handler;
}

export async function getLimits(userId?: string): Promise<StorageLimits> {
	try {
		return await _getLimits!(userId);
	} catch {
		return config.storage.limits;
	}
}
