import { loadDefaultConfigs } from '@axium/server/config';
import { clean, database } from '@axium/server/database';
import { _markDefaults } from '@axium/server/routes';
import './api/index.js';

_markDefaults();
await loadDefaultConfigs();
await clean({});

process.on('beforeExit', async () => {
	await database.destroy();
});
