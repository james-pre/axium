import { debug, warn } from 'ioium';
import * as z from 'zod';

export const ClientConfig = z.looseObject({
	token: z.base64url().nullish(),
	server: z.url().nullish(),
	plugins: z.string().array().default([]),
});

export interface ClientConfig extends z.infer<typeof ClientConfig> {}

export const config: ClientConfig = {
	plugins: [],
};

export function resolveServerURL(server: string) {
	if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'https://' + server;

	const url = new URL(server);
	if (url.pathname.endsWith('/api')) url.pathname += '/';
	else if (url.pathname.at(-1) == '/' && !url.pathname.endsWith('/api/')) url.pathname += 'api/';

	if (url.pathname != '/api/') warn('Resolved server URL is not at the top level: ' + url.href);
	else debug('Resolved server URL: ' + url.href);

	return url.href;
}
