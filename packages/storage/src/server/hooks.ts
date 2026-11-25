import { getConfig } from '@axium/core';
import { count } from '@axium/server/database';
import { addShortcut } from '@axium/server/routes';
import { track } from 'ioium/node';
import { mkdirSync } from 'node:fs';
import { bytes as formatBytes } from 'utilium/format';
import { decodeUUID } from 'utilium/string';
import * as z from 'zod';
import '../common.js';
import './api.js';
import * as appDirectories from './app-directories.js';
import './batch.js';
import { getTotalUse, purgeTrash } from './db.js';
import './raw.js';
import './syncs.js';
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

export async function clean() {
	await track('Removing expired trash items', purgeTrash());
}

export async function pluginRemoved(name: string) {
	await track(`Removing app directories for ${name}`, appDirectories.removeAll(name));
}
