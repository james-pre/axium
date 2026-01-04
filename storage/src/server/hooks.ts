import { formatBytes } from '@axium/core/format';
import { done, start } from '@axium/core/node/io';
import config from '@axium/server/config';
import type { OpOptions } from '@axium/server/database';
import { count, database } from '@axium/server/database';
import { mkdirSync } from 'node:fs';
import '../common.js';
import './index.js';

mkdirSync(config.storage.data, { recursive: true });

export async function statusText(): Promise<string> {
	const { storage: items } = await count('storage');
	const { size } = await database
		.selectFrom('storage')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return `${items} items totaling ${formatBytes(Number(size))}`;
}

export async function clean(opt: OpOptions) {
	start('Removing expired trash items');

	const nDaysAgo = new Date(Date.now() - 86400000 * config.storage.trash_duration);
	await database
		.deleteFrom('storage')
		.where('trashedAt', 'is not', null)
		.where('trashedAt', '<', nDaysAgo)
		.executeTakeFirstOrThrow()
		.then(done);
}
