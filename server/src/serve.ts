import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import { homedir } from 'node:os';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
}

export async function serve(opt: Partial<ServeOptions>): Promise<Server> {
	// @ts-ignore 2307 - The SvelteKit server can be built after `tsc -b` is run
	const { handler } = await import('../build/handler.js');

	if (!opt.secure) return createServer(handler);

	return createSecureServer(
		{
			key: readFileSync(join(homedir(), '.vite-plugin-mkcert/dev.pem')),
			cert: readFileSync(join(homedir(), '.vite-plugin-mkcert/cert.pem')),
		},
		handler
	);
}

export default serve;
