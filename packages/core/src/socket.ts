import * as z from 'zod';
import type { InferFromTuple } from './schemas.js';

/** Used to avoid having `z.function` + `z.void` */
type SchemaShortcut = readonly [...(readonly z.ZodType[]), callback: readonly z.ZodType[]];

// "args" (array of schemas) //

export type EventArgs = readonly z.ZodType[] | SchemaShortcut;

/** Parse the shortcut into the input for `z.function` */
export type ParseArgs<T, Fallback> = T extends readonly [
	...infer Args extends readonly z.ZodType[],
	infer CallbackArgs extends readonly z.ZodType[],
]
	? [...Args, callback: z.ZodFunction<z.ZodTuple<CallbackArgs>, z.ZodVoid>]
	: Fallback;

/** Whether the schema ends in an array which should be used as the arguments for the callback */
function _hasTrailingRawCallback(schema: EventSchemaLike): schema is SchemaShortcut {
	if (!Array.isArray(schema) || !schema.length) return false;
	const last = schema.at(-1);
	return last && Array.isArray(last);
}

/** Parse the shortcut into the input for `z.function` */
export function parseArgs<T extends readonly z.ZodType[] | SchemaShortcut>(schema: T): ParseArgs<T, T & ReadonlyArray<z.ZodType>> {
	return _hasTrailingRawCallback(schema)
		? ([
				...(schema.length > 1 ? schema.slice(0, -1) : []),
				z.function({ input: schema.at(-1) as readonly z.ZodType[], output: z.void() }),
			] as ParseArgs<T, never>)
		: (schema as any);
}

export type InferArgs<T> = T extends readonly [infer Callback extends readonly z.ZodType[]]
	? [callback: (...args: InferFromTuple<Callback>) => void]
	: T extends readonly [z.ZodFunction<z.ZodTuple<infer Args extends readonly z.ZodType[]>>]
		? [callback: (...args: InferFromTuple<Args>) => void]
		: T extends readonly [infer Head extends z.ZodType, ...infer Rest extends readonly z.ZodType[]]
			? [z.infer<Head>, ...InferArgs<Rest>]
			: [];

// args + tuple schemas //

export type ParseTuple<T, Fallback extends z.util.TupleItems = T & ReadonlyArray<z.ZodType>> = T extends z.ZodTuple
	? T
	: z.ZodTuple<ParseArgs<T, Fallback>>;

export function parseTuple<T extends EventArgs>(schema: T): ParseTuple<T> {
	return (schema instanceof z.ZodTuple ? schema : z.tuple(parseArgs(schema) as any)) as ParseTuple<T>;
}

export type ParseTuples<T extends Record<string, EventArgs>> = {
	[K in keyof T]: ParseTuple<T[K]>;
};

// args + tuple + function schemas //

export type EventSchemaLike = z.ZodFunction<any, z.ZodVoid> | EventArgs;

export type ParseFunction<T extends EventSchemaLike> = T extends z.ZodFunction
	? T
	: z.ZodFunction<T extends z.ZodTuple ? T : z.ZodTuple<ParseArgs<T, T extends readonly z.ZodType[] ? T : never>>, z.ZodVoid>;

export function parseFunction<T extends EventSchemaLike>(schema: T): ParseFunction<T> {
	return (schema instanceof z.ZodFunction ? schema : z.function({ input: parseArgs(schema), output: z.void() })) satisfies z.ZodFunction<
		any,
		z.ZodVoid
	> as ParseFunction<T>;
}

export type ParseFunctions<T extends Record<string, EventSchemaLike>> = {
	[K in keyof T & string]: ParseFunction<T[K]>;
};

export type InferEvent<T> =
	T extends z.ZodFunction<infer Input extends z.ZodTuple, any>
		? InferEvent<Input>
		: (...args: InferArgs<T extends z.ZodTuple<infer Args extends readonly z.ZodType[]> ? Args : T>) => void;

export type InferEvents<T> = {
	[K in keyof T & string as T[K] extends EventSchemaLike | z.ZodTuple ? K : never]: InferEvent<T[K]>;
};

// server -> client //

export interface ServerToClient {}
export const ServerToClient = {} as ServerToClient;
export interface ServerToClientEvents extends InferEvents<ServerToClient> {}

export function addServerToClient(schemas: Record<keyof ServerToClient, EventSchemaLike>) {
	for (const [event, schema] of Object.entries(schemas) as [string, EventSchemaLike][])
		(ServerToClient as any)[event] = parseFunction(schema);
}

// client -> server //

export interface ClientToServer {}
export const ClientToServer = {} as ClientToServer;
export interface ClientToServerEvents extends InferEvents<ClientToServer> {}

export function addClientToServer(schemas: Record<keyof ClientToServer, EventArgs>) {
	for (const [event, schema] of Object.entries(schemas) as [string, EventArgs][]) (ClientToServer as any)[event] = parseTuple(schema);
}
