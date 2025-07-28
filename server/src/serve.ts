import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import config from './config.js';
import '@axium/server/api/index';
import { loadDefaultConfigs } from '@axium/server/config';
import { clean, connect, database } from '@axium/server/database';
import { dirs, logger } from '@axium/server/io';
import { allLogLevels } from 'logzen';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
	build: string;
}

export async function serveSvelteKit(opt: Partial<ServeOptions>): Promise<Server> {
	const { handler } = await import(opt.build || config.web.build);

	if (!opt.secure && !config.web.secure) return createServer(handler);

	return createSecureServer(
		{ key: readFileSync(opt.ssl_key || config.web.ssl_key), cert: readFileSync(opt.ssl_cert || config.web.ssl_cert) },
		handler
	);
}

/**
 * Perform initial setup for when the server is serving web pages.
 */
export async function init() {
	logger.attach(createWriteStream(join(dirs.at(-1)!, 'server.log')), { output: allLogLevels });
	await loadDefaultConfigs();
	connect();
	await clean({});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	process.on('beforeExit', () => database.destroy());
}
