import { debug, warn } from '@axium/core/io';
import { App, Session, User } from '@axium/core';
import * as z from 'zod';

export const ClientConfig = z.looseObject({
	token: z.base64().nullish(),
	server: z.url().nullish(),
	// Cache to reduce server load:
	cache: z
		.looseObject({
			fetched: z.int(),
			session: Session.extend({ user: User }),
			apps: App.array(),
		})
		.nullish(),
	plugins: z.string().array().default([]),
});

export interface ClientConfig extends z.infer<typeof ClientConfig> {}

export let config: ClientConfig;

export function resolveServerURL(server: string) {
	if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'https://' + server;

	const url = new URL(server);
	if (url.pathname.endsWith('/api')) url.pathname += '/';
	else if (url.pathname.at(-1) == '/' && !url.pathname.endsWith('/api/')) url.pathname += 'api/';

	if (url.pathname != '/api/') warn('Resolved server URL is not at the top level: ' + url.href);
	else debug('Resolved server URL: ' + url.href);

	return url.href;
}
