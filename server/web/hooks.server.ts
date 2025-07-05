import '@axium/server/api/index';
import { loadDefaultConfigs } from '@axium/server/config';
import { clean, database } from '@axium/server/database';
import { dirs, logger } from '@axium/server/io';
import { allLogLevels } from 'logzen';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';

logger.attach(createWriteStream(join(dirs.at(-1), 'server.log')), { output: allLogLevels });
await loadDefaultConfigs();
await clean({});

process.on('beforeExit', async () => {
	await database.destroy();
});

export { handle } from '@axium/server/sveltekit';
