import { getConfig, Severity } from '@axium/core';
import { addEvent } from '@axium/server/audit';
import { statfsSync } from 'node:fs';
import * as z from 'zod';
import type { StorageLimits } from '../common.js';
import '../polyfills.js';
import { getTotalUse } from './db.js';

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

function getSystemAvailable(): bigint {
	const { bavail, bsize } = statfsSync(getConfig('@axium/storage').data, { bigint: true });
	return (bavail * bsize) / 1_000_000n;
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

let _cachedUnlimited: bigint,
	_cachedTime = 0;

/**
 * Used when there is no user limit, that way users have an idea of how close they are to filling up system storage.
 * @returns The maximum size that we can use in MB
 */
async function _unlimitedLimit(): Promise<bigint> {
	if (_cachedUnlimited && Date.now() - _cachedTime < 300_000) return _cachedUnlimited;
	_cachedUnlimited = getSystemAvailable() + (await getTotalUse()) / 1_000_000n;
	_cachedTime = Date.now();
	return _cachedUnlimited;
}

export async function getLimits(userId?: string): Promise<StorageLimits> {
	let limits: StorageLimits;
	try {
		limits = await _getLimits!(userId);
	} catch {
		limits = structuredClone(getConfig('@axium/storage').limits);
	}

	limits.user_size ||= Number(await _unlimitedLimit());

	return limits;
}
