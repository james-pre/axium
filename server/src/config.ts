/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { levelText } from 'logzen';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { deepAssign, omit, type PartialRecursive } from 'utilium';
import * as z from 'zod';
import { findDir, logger, output } from './io.js';
import { loadPlugin } from './plugins.js';

export const Schema = z
	.object({
		api: z.object({
			disable_metadata: z.boolean(),
			cookie_auth: z.boolean(),
		}),
		apps: z.object({
			disabled: z.array(z.string()),
		}),
		auth: z.object({
			credentials: z.boolean(),
			debug: z.boolean(),
			origin: z.string(),
			rp_id: z.string(),
			rp_name: z.string(),
			secure_cookies: z.boolean(),
			/** In minutes */
			verification_timeout: z.number(),
		}),
		db: z.object({
			host: z.string(),
			port: z.number(),
			password: z.string(),
			user: z.string(),
			database: z.string(),
		}),
		debug: z.boolean(),
		log: z.object({
			level: z.enum(levelText),
			console: z.boolean(),
		}),
		web: z.object({
			prefix: z.string(),
		}),
	})
	.passthrough();

export interface Config extends Record<string, unknown>, z.infer<typeof Schema> {}

export const configFiles = new Map<string, PartialRecursive<Config>>();

export function plainConfig(): Omit<Config, keyof typeof configShortcuts> {
	return omit(config, Object.keys(configShortcuts) as (keyof typeof configShortcuts)[]);
}

const configShortcuts = {
	findPath: findConfigPath,
	load: loadConfig,
	loadDefaults: loadDefaultConfigs,
	plain: plainConfig,
	save: saveConfig,
	saveTo: saveConfigTo,
	set: setConfig,
	files: configFiles,
};

export const config: Config & typeof configShortcuts = {
	...configShortcuts,
	api: {
		disable_metadata: false,
		cookie_auth: false,
	},
	apps: {
		disabled: [],
	},
	auth: {
		credentials: false,
		debug: false,
		origin: 'https://test.localhost',
		rp_id: 'test.localhost',
		rp_name: 'Axium',
		secure_cookies: true,
		verification_timeout: 60,
	},
	db: {
		database: process.env.PGDATABASE || 'axium',
		host: process.env.PGHOST || 'localhost',
		password: process.env.PGPASSWORD || '',
		port: process.env.PGPORT && Number.isSafeInteger(parseInt(process.env.PGPORT)) ? parseInt(process.env.PGPORT) : 5432,
		user: process.env.PGUSER || 'axium',
	},
	debug: false,
	log: {
		console: true,
		level: 'info',
	},
	web: {
		prefix: '',
	},
};
export default config;

// config from file
export const File = Schema.deepPartial()
	.extend({
		include: z.array(z.string()).optional(),
		plugins: z.array(z.string()).optional(),
	})
	.passthrough();
export interface File extends PartialRecursive<Config>, z.infer<typeof File> {}

/**
 * Update the current config
 */
export function setConfig(other: PartialRecursive<Config>) {
	deepAssign(config, other);
	logger.detach(output);
	if (config.log.console) logger.attach(output, { output: config.log.level });
}

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
export async function loadConfig(path: string, options: LoadOptions = {}) {
	let json;
	try {
		json = JSON.parse(readFileSync(path, 'utf8'));
	} catch (e: any) {
		if (!options.optional) throw e;
		config.debug && output.debug(`Skipping config at ${path} (${e.message})`);
		return;
	}

	const file: File = options.strict ? File.parse(json) : json;
	configFiles.set(path, file);
	setConfig(file);
	for (const include of file.include ?? []) await loadConfig(join(dirname(path), include), { optional: true });
	for (const plugin of file.plugins ?? []) await loadPlugin(plugin.startsWith('.') ? resolve(dirname(path), plugin) : plugin);
}

export async function loadDefaultConfigs() {
	for (const path of [findConfigPath(true), findConfigPath(false)]) {
		if (!existsSync(path)) writeFileSync(path, '{}');
		await loadConfig(path, { optional: true });
	}
}

/**
 * Update the current config and write the updated config to the appropriate file
 */
export function saveConfig(changed: PartialRecursive<Config>, global: boolean = false) {
	saveConfigTo(process.env.AXIUM_CONFIG ?? findConfigPath(global), changed);
}

/**
 * Update the current config and write the updated config to the provided path
 */
export function saveConfigTo(path: string, changed: PartialRecursive<Config>) {
	setConfig(changed);
	const config = configFiles.get(path) ?? {};
	Object.assign(config, { ...changed, db: { ...config.db, ...changed.db } });

	config.debug && output.debug(`Wrote config to ${path}`);
	writeFileSync(path, JSON.stringify(config));
}

/**
 * Find the path to the config file
 */
export function findConfigPath(global: boolean): string {
	if (process.env.AXIUM_CONFIG) return process.env.AXIUM_CONFIG;
	return join(findDir(global), 'config.json');
}

if (process.env.AXIUM_CONFIG) await loadConfig(process.env.AXIUM_CONFIG);
