import { getConfig } from '@axium/core';
import { formatBytes } from '@axium/core/format';
import { done, start } from '@axium/core/node/io';
import type { OpOptions } from '@axium/server/database';
import { count, database } from '@axium/server/database';
import { mkdirSync } from 'node:fs';
import '../common.js';
import './index.js';
import { getTotalUse } from './db.js';

export function load() {
	mkdirSync(getConfig('@axium/storage').data, { recursive: true });
}

export async function statusText(): Promise<string> {
	const { storage: items } = await count('storage');
	const size = await getTotalUse();

	return `${items} items totaling ${formatBytes(Number(size))}`;
}

export async function clean(opt: OpOptions) {
	start('Removing expired trash items');

	const nDaysAgo = new Date(Date.now() - 86400000 * getConfig('@axium/storage').trash_duration);
	await database
		.deleteFrom('storage')
		.where('trashedAt', 'is not', null)
		.where('trashedAt', '<', nDaysAgo)
		.executeTakeFirstOrThrow()
		.then(done);
}
