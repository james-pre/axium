import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
}

export async function serve(opt: Partial<ServeOptions>): Promise<Server> {
	// @ts-ignore 2307 - The SvelteKit server can be built after `tsc -b` is run
	const { handler } = await import('../build/handler.js');

	if (!opt.secure) return createServer(handler as any);

	return createSecureServer({ key: opt.ssl_key, cert: opt.ssl_cert }, handler as any);
}

export default serve;
