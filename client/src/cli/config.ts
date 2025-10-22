import { User } from '@axium/core';
import * as io from '@axium/core/node/io';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import * as z from 'zod';
import { setPrefix, setToken } from '../requests.js';

const axcDir = join(homedir(), '.axium/client');
mkdirSync(axcDir, { recursive: true });

const ClientSession = z.object({
	token: z.string(),
	server: z.url(),
	userId: z.uuid(),
	// Cached to reduce server load:
	sessionId: z.uuid(),
	user: User.optional(),
	_fetched: z.int(),
});

export interface ClientSession extends z.infer<typeof ClientSession> {}

export let session: ClientSession | null = null;

export function loadSession() {
	try {
		const sessionData = JSON.parse(readFileSync(join(axcDir, 'session.json'), 'utf-8'));
		session = ClientSession.parse(sessionData);
		setPrefix(session.server);
		setToken(session.token);
	} catch (e: any) {
		io.debug('Failed to load session: ' + (e instanceof z.core.$ZodError ? z.prettifyError(e) : e.message));
	}
}

export function saveSession(session: ClientSession) {
	const path = join(axcDir, 'session.json');

	writeFileSync(
		path,
		JSON.stringify(session, null, 4).replaceAll(/^( {4})+/g, match => '\t'.repeat(match.length / 4)),
		'utf-8'
	);
	io.debug('Saved session to ' + path);
}

export function resolveServerURL(server: string) {
	if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'https://' + server;

	const url = new URL(server);
	if (url.pathname.endsWith('/api')) url.pathname += '/';
	else if (url.pathname.at(-1) == '/' && !url.pathname.endsWith('/api/')) url.pathname += 'api/';

	if (url.pathname != '/api/') io.warn('Resolved server URL is not at the top level: ' + url.href);
	else io.debug('Resolved server URL: ' + url.href);

	return url.href;
}

export const _dayMs = 24 * 3600_000;
