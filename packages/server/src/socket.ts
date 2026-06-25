import type { ClientToServerEvents, InferEvents, ServerToClientEvents } from '@axium/core/socket';
import * as z from 'zod';
import { ClientToServer } from '@axium/core/socket';
import * as cookie from 'cookie_v1';
import type { Http2Server } from 'node:http2';
import { Server, type ExtendedError, type Socket as PlainSocket } from 'socket.io';
import { getSessionAndUser, type SessionAndUser } from './auth.js';
import { config } from './config.js';

// server -> server
export interface ServerToServer extends Record<string, z.ZodFunction<any, z.ZodVoid>> {}
export const ServerToServer = {} as ServerToServer;
export interface ServerToServerEvents extends InferEvents<ServerToServer> {}

export interface SocketData {
	/** The authenticated session and user for this connection. */
	session: SessionAndUser;
}

export interface Socket extends PlainSocket<ClientToServerEvents, ServerToClientEvents, ServerToServerEvents, SocketData> {}

const listeners = new Set<Parameters<Socket['on']>>();

export function addListener(...[event, listener]: Parameters<Socket['on']>) {
	listeners.add([event, listener]);
}

function handleConnection(socket: Socket) {
	socket.use(([event, ...args], next) => {
		const schema = ClientToServer[event as keyof ClientToServer] as z.ZodTuple;
		if (!schema) return next(new Error(`unknown event: ${event}`));

		const result = schema.safeParse(args);
		if (!result.success) return next(new Error(z.prettifyError(result.error)));
		next();
	});
	for (const [event, listener] of listeners) socket.on(event, listener);
}

/** Extract the session token from a connection handshake, mirroring `getToken` for HTTP requests. */
function getToken(socket: Socket): string | undefined {
	const { headers } = socket.handshake;

	const header_token = headers.authorization?.replace('Bearer ', '');
	if (header_token) return header_token;

	if (config.debug || !config.auth.header_only) return cookie.parse(headers.cookie || '').session_token;
}

async function authenticate(socket: Socket, next: (err?: ExtendedError) => void): Promise<void> {
	const token = getToken(socket);
	if (!token) return next(new Error('Missing session (you are not logged in)'));

	let session: SessionAndUser;
	try {
		session = await getSessionAndUser(token);
	} catch {
		return next(new Error('Invalid or expired session'));
	}

	if (session.user.isSuspended) return next(new Error('User is suspended'));

	socket.data.session = session;

	// Local clients (the Axium client daemon/CLI) identify via their user agent; everything else is a browser.
	const isLocal = /axium[- ]client/i.test(socket.handshake.headers['user-agent'] || '');
	await socket.join([isLocal ? 'local' : 'web', `user:${session.user.id}`]);

	next();
}

export default function createServer(http: Http2Server) {
	const io = new Server<ClientToServerEvents, ServerToClientEvents, ServerToServerEvents, SocketData>(http);
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	io.use(authenticate);
	io.on('connection', handleConnection);
}
