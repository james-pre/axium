import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { handler } from '../build/handler.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import { homedir } from 'node:os';

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
}

export function serve(opt: Partial<ServeOptions>): Server {
	if (!opt.secure) return createServer(handler as any);

	return createSecureServer(
		{
			key: readFileSync(join(homedir(), '.vite-plugin-mkcert/dev.pem')),
			cert: readFileSync(join(homedir(), '.vite-plugin-mkcert/cert.pem')),
		},
		handler as any
	);
}

export default serve;
