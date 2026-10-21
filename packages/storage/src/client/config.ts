import { configDir } from '@axium/client/cli/config';
import { debug, exit, readJSON, writeJSON } from 'ioium/node';
import { join, resolve } from 'node:path/posix';
import * as z from 'zod';
import { resolvePath } from './local.js';
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

/** Find a Sync by its name, local path, or remote path. */
export function findSync(search: string): Sync {
	const local = resolve(search);
	const remote = resolvePath(search);
	const sync = config.sync.find(
		candidate => candidate.local_path == local || candidate.name == search || candidate.remote_path == remote
	);
	if (!sync) exit('Can not find a synced folder matching ' + search);
	return sync;
}
