import { getConfig } from '@axium/core';
import { formatBytes } from '@axium/core/format';
import type { OpOptions } from '@axium/server/database';
import { count, database } from '@axium/server/database';
import { addShortcut } from '@axium/server/routes';
import { track } from 'ioium/node';
import { mkdirSync } from 'node:fs';
import { decodeUUID } from 'utilium/string';
import * as z from 'zod';
import '../common.js';
import './api.js';
import './batch.js';
import { getTotalUse } from './db.js';
import './raw.js';
import './zip.js';

addShortcut('/f/:id', { id: z.base64url() }, ({ id }) => `/files/${decodeUUID(Uint8Array.fromBase64(id, { alphabet: 'base64url' }))}`);

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
