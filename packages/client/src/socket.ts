import type { ClientToServerEvents, ServerToClientEvents } from '@axium/core/socket';
import { ServerToClient } from '@axium/core/socket';
import * as io from 'ioium';
import type { ManagerOptions, Socket as PlainSocket, SocketOptions } from 'socket.io-client';
import { io as socketIO } from 'socket.io-client';
import type * as z from 'zod';
import { origin, token, userAgent } from './requests.js';

export interface Socket extends PlainSocket<ServerToClientEvents, ClientToServerEvents> {}

const listeners = new Set<Parameters<Socket['on']>>();

export function addListener<T extends keyof ServerToClient & string>(event: T, listener: ServerToClientEvents[T]) {
	const schema = ServerToClient[event] as z.ZodFunction<any, z.ZodVoid>;
	if (schema) listeners.add([event, schema.implement(listener)]);
	else {
		io.warn(`Attaching a listener to the '${event as string}' socket event without schema`);
		listeners.add([event, listener]);
	}
}

export interface ConnectOptions extends Partial<ManagerOptions & SocketOptions> {}

export let socket: Socket | null = null;

export function connect(opts?: ConnectOptions): Promise<Socket> {
	if (socket) return Promise.resolve(socket);

	if (!token) io.warn('Connecting to the server socket without a session token.');

	const { extraHeaders = {} } = opts || {};
	if (token) extraHeaders.Authorization = 'Bearer ' + token;
	if (userAgent) extraHeaders['User-Agent'] = userAgent;

	socket = socketIO(origin, { ...opts, extraHeaders });
	for (const [event, listener] of listeners) socket.on(event, listener);

	const { promise, resolve, reject } = Promise.withResolvers<Socket>();

	socket.on('connect', () => {
		io.debug('socket: Connected as ' + socket!.id);
		resolve(socket!);
	});

	socket.on('connect_error', err => {
		socket = null;
		reject(err);
	});

	return promise;
}
