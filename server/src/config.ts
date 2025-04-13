/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { levelText } from 'logzen';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path/posix';
import { assignWithDefaults, type PartialRecursive } from 'utilium';
import * as z from 'zod';
import { findDir, logger, output } from './io.js';

export const Database = z.object({
	host: z.string(),
	port: z.number(),
	password: z.string(),
	user: z.string(),
	database: z.string(),
});
export type Database = z.infer<typeof Database>;

export const db: Database = {
	host: process.env.PGHOST || 'localhost',
	port: process.env.PGPORT && Number.isSafeInteger(parseInt(process.env.PGPORT)) ? parseInt(process.env.PGPORT) : 5432,
	password: process.env.PGPASSWORD || '',
	user: process.env.PGUSER || 'axium',
	database: process.env.PGDATABASE || 'axium',
};

export const Auth = z.object({
	credentials: z.boolean(),
	debug: z.boolean().optional(),
	secret: z.string(),
	secure_cookies: z.boolean(),
});
export type Auth = z.infer<typeof Auth>;

export const auth: Auth = {
	credentials: false,
	secret: '',
	secure_cookies: false,
};

export const Log = z.object({
	level: z.enum(levelText),
	console: z.boolean(),
});
export type Log = z.infer<typeof Log>;

export const log: Log = {
	level: 'info',
	console: true,
};

export const Config = z.object({
	auth: Auth.partial(),
	debug: z.boolean(),
	db: Database.partial(),
	log: Log.partial(),
});

// config from file
export const File = Config.deepPartial().extend({
	include: z.array(z.string()).optional(),
});
export type File = z.infer<typeof File>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Config extends z.infer<typeof Config> {}

export let debug: boolean = false;

export function get(): Config {
	return {
		auth,
		db,
		debug,
		log,
	};
}

/**
 * Update the current config
 */
export function set(config: PartialRecursive<Config>) {
	assignWithDefaults(auth, config.auth ?? {});
	debug = config.debug ?? debug;
	assignWithDefaults(db, config.db ?? {});
	assignWithDefaults(log, config.log ?? {});
	logger.detach(output);
	if (log.console) logger.attach(output, { output: log.level });
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
		debug && output.debug(`Skipping config at ${path} (${e.message})`);
		return;
	}

	const config: File = options.strict ? File.parse(json) : json;
	files.set(path, config);
	set(config);
	for (const include of config.include ?? []) load(join(dirname(path), include), { optional: true });
}

export function loadDefaults() {
	load(findPath(true), { optional: true });
	load(findPath(false), { optional: true });
}

/**
 * Update the current config and write the updated config to the appropriate file
 */
export function save(changed: PartialRecursive<Config>, global: boolean = false) {
	saveTo(process.env.AXIUM_CONFIG ?? findPath(global), changed);
}

/**
 * Update the current config and write the updated config to the provided path
 */
export function saveTo(path: string, changed: PartialRecursive<Config>) {
	set(changed);
	const config = files.get(path) ?? {};
	Object.assign(config, { ...changed, db: { ...config.db, ...changed.db } });

	debug && output.debug(`Wrote config to ${path}`);
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
