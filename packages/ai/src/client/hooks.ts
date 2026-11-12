import * as io from 'ioium/node';
import { mkdirSync, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import * as llama from '../node/llama.js';
import * as models from '../node/models.js';
import { configManager } from './config.js';
import './local.js';

async function applyConfig(): Promise<void> {
	if (!llama.settingsChanged()) return await models.syncPreset();

	io.info('AI: restarting llama-server with the new settings');
	await llama.stop();
	await models.syncPreset();
	await llama.start();
}

/** Runs the device's llama-server while the daemon runs, following changes to the device's AI config */
export async function daemon(): Promise<void> {
	await models.syncPreset();
	await llama.start();

	const path = configManager.findPath('user');
	mkdirSync(dirname(path), { recursive: true });
	let timer: NodeJS.Timeout | undefined;
	watch(dirname(path), (_, filename) => {
		if (filename != basename(path)) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			configManager.reloadFiles();
			void applyConfig().catch(error => io.error('AI: could not apply the config:', io.errorText(error)));
		}, 500);
	});
}
