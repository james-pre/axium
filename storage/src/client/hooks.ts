import { config } from './config.js';
import { doSync } from './sync.js';

export async function run() {
	for (const sync of config.sync) await doSync(sync, { delete: 'none', dryRun: false, verbose: true });
}
