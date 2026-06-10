import { getConfig } from '@axium/core';
import { formatBytes } from '@axium/core/format';
import type { OpOptions } from '@axium/server/database';
import { count, database } from '@axium/server/database';
import { track } from 'ioium/node';
import { mkdirSync } from 'node:fs';
import '../common.js';
import { getTotalUse } from './db.js';
import './index.js';

export function load() {
	mkdirSync(getConfig('@axium/storage').data, { recursive: true });
}

export async function statusText(): Promise<string> {
	const { storage: items } = await count('storage');
	const size = await getTotalUse();

	return `${items} items totaling ${formatBytes(size)}`;
}

export async function clean(opt: OpOptions) {
	const nDaysAgo = new Date(Date.now() - 86400000 * getConfig('@axium/storage').trash_duration);
	await track(
		'Removing expired trash items',
		database.deleteFrom('storage').where('trashedAt', 'is not', null).where('trashedAt', '<', nDaysAgo).executeTakeFirstOrThrow()
	);
}
