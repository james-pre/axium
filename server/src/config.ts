/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import type { PartialRecursive } from 'utilium';
import * as z from 'zod';
import { findDir, verbose } from './io.js';

export const Database = z
	.object({
		host: z.string(),
		port: z.number(),
		password: z.string(),
	})
	.partial();
export type Database = z.infer<typeof Database>;

export const db: Database = {};

export const schema = z.object({
	credentials: z.boolean(),
	passkeys: z.boolean(),
	debug: z.boolean(),
	db: Database.partial(),
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Config extends z.infer<typeof schema> {}

export const authProviders = ['credentials', 'passkeys'] as const;
export type AuthProvider = (typeof authProviders)[number];

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

/**
 * Update the current config
 */
export function set(config: PartialRecursive<Config>) {
	credentials = config.credentials ?? credentials;
	debug = config.debug ?? debug;
	Object.assign(db, config.db);
	passkeys = config.passkeys ?? passkeys;
}

export const files = new Map<string, PartialRecursive<Config>>();

export interface LoadOptions {
	/**
	 * If enabled, the config file will be not be loaded if it does not match the schema.
	 */
	strict?: boolean;

	/**
	 * If enabled, the config file will be skipped if it does not exist.
	 */
	optional?: boolean;

	/**
	 * If `optional`, this function will be called with the error if the config file is invalid or can't be read.
	 */
	onError?(error: Error): void;
}

/**
 * Load the config from the provided path
 */
export function load(path: string, options: LoadOptions = {}) {
	let json;
	try {
		json = JSON.parse(readFileSync(path, 'utf8'));
	} catch (e: any) {
		if (!options.optional) throw e;
		verbose && console.warn(`Skipping config at ${path} (${e.message})`);
		return;
	}

	const config: PartialRecursive<Config> = options.strict ? schema.deepPartial().parse(json) : json;
	files.set(path, config);
	set(config);
	verbose && console.debug('Loaded config file:', path);
}

export function loadDefaults() {
	load(findPath(true), { optional: true });
	load(findPath(false), { optional: true });
}

/**
 * Update the current config and write the updated config to the appropriate file
 */
export function save(changed: PartialRecursive<Config>, global: boolean = false) {
	saveTo(process.env.AXIUM_CONFIG ?? findDir(global), changed);
}

/**
 * Update the current config and write the updated config to the provided path
 */
export function saveTo(path: string, changed: PartialRecursive<Config>) {
	set(changed);
	const config = files.get(path) ?? {};
	Object.assign(config, changed);

	verbose && console.log('Wrote config to', path);
	writeFileSync(path, JSON.stringify(config));
}

/**
 * Find the path to the config file
 */
export function findPath(global: boolean): string {
	if (process.env.AXIUM_CONFIG) return process.env.AXIUM_CONFIG;
	return join(findDir(global), 'config.json');
}

if (process.env.AXIUM_CONFIG) load(process.env.AXIUM_CONFIG);
