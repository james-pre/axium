import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
}

const _handlerPath = '../build/handler.js';

export async function serve(opt: Partial<ServeOptions>): Promise<Server> {
	const { handler } = await import(_handlerPath);

	if (!opt.secure) return createServer(handler);

	return createSecureServer({ key: opt.ssl_key, cert: opt.ssl_cert }, handler);
}

export default serve;
