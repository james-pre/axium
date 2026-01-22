import { getConfig, Severity } from '@axium/core';
import { addEvent } from '@axium/server/audit';
import * as z from 'zod';
import type { StorageLimits } from '../common.js';
import '../polyfills.js';

export const defaultCASMime = [/video\/.*/, /audio\/.*/];

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
		return getConfig('@axium/storage').limits;
	}
}
