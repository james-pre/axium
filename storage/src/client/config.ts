import { configDir } from '@axium/client/cli/config';
import { debug, readJSON, writeJSON } from '@axium/core/node/io';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { Sync } from './sync.js';

const ClientStorageConfig = z.looseObject({
	sync: Sync.array(),
});

export interface ClientStorageConfig extends z.infer<typeof ClientStorageConfig> {}

const configPath = join(configDir, 'storage.json');

export let config: ClientStorageConfig = { sync: [] };

try {
	config = readJSON(configPath, ClientStorageConfig);
} catch (e: any) {
	debug('Could not load @axium/storage config: ' + e);
}

export function saveConfig() {
	writeJSON(configPath, config);
	debug('Saved @axium/storage config.');
}
