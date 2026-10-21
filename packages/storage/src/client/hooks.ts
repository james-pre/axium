import * as io from 'ioium/node';
import { config, saveConfig } from './config.js';
import { doSync } from './sync.js';

export async function run() {
	for (const sync of config.sync) {
		try {
			await doSync(sync, { conflicts: 'both', dryRun: false, verbose: true });
		} catch (e) {
			io.error(`${sync.name}: ${io.errorText(e)}`);
		}
	}
	saveConfig();
}
