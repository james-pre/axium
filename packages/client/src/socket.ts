import type { ClientToServerEvents, ServerToClientEvents } from '@axium/core/socket';
import { ServerToClient } from '@axium/core/socket';
import * as io from 'ioium';
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { io as socketIO } from 'socket.io-client';
import type * as z from 'zod';

export interface _Socket extends Socket<ServerToClientEvents, ClientToServerEvents> {}

const listeners = new Set<Parameters<_Socket['on']>>();

export function addListener<T extends keyof ServerToClient & string>(event: T, listener: ServerToClientEvents[T]) {
	const schema = ServerToClient[event] as z.ZodFunction<any, z.ZodVoid>;
	if (schema) listeners.add([event, schema.implement(listener)]);
	else {
		io.warn(`Attaching a listener to the '${event as string}' socket event without schema`);
		listeners.add([event, listener]);
	}
}

export function connect(opts?: Partial<ManagerOptions & SocketOptions>): _Socket;
export function connect(uri?: string, opts?: Partial<ManagerOptions & SocketOptions>): _Socket;
export function connect(uriOrOpts?: any, opts?: Partial<ManagerOptions & SocketOptions>): _Socket {
	const socket: _Socket = socketIO(uriOrOpts, opts);
	for (const [event, listener] of listeners) socket.on(event, listener);
	return socket;
}
