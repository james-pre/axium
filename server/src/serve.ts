import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import config from './config.js';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
}

const _handlerPath = '../build/handler.js';

export async function serve(opt: Partial<ServeOptions>): Promise<Server> {
	const { handler } = await import(_handlerPath);

	if (!opt.secure && !config.web.secure) return createServer(handler);

	return createSecureServer(
		{ key: readFileSync(opt.ssl_key || config.web.ssl_key), cert: readFileSync(opt.ssl_cert || config.web.ssl_cert) },
		handler
	);
}
