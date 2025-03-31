import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { PartialRecursive } from 'utilium';
import * as z from 'zod';

export const Database = z
	.object({
		host: z.string(),
		port: z.number(),
		password: z.string(),
	})
	.partial();
export type Database = z.infer<typeof Database>;

export let db: Database = {};

export const schema = z.object({
	credentials: z.boolean(),
	passkeys: z.boolean(),
	debug: z.boolean(),
	db: Database.partial(),
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Config extends z.infer<typeof schema> {}

export type AuthProvider = 'credentials' | 'passkeys';

export let credentials: boolean = true;
export let passkeys: boolean = true;
export let debug: boolean = false;

export function get(): Config {
	return {
		credentials,
		db,
		debug,
		passkeys,
	};
}

export function set(config: PartialRecursive<Config>) {
	credentials = config.credentials ?? credentials;
	debug = config.debug ?? debug;
	Object.assign(db, config.db);
	passkeys = config.passkeys ?? passkeys;
}

export const files = new Map<string, PartialRecursive<Config>>();

export function load(path: string) {
	const result: PartialRecursive<Config> = schema.deepPartial().parse(JSON.parse(readFileSync(path, 'utf8')));
	files.set(path, result);
	set(result);
}

export function save(path: string, changed: PartialRecursive<Config>) {
	const config = files.get(path) ?? {};
	Object.assign(config, changed);

	writeFileSync(path, JSON.stringify(config));
}

export function findLocal(): string {
	return '';
}

if (process.env.AXIUM_CONFIG) load(process.env.AXIUM_CONFIG);

if (existsSync('/etc/axium/')) {
}
