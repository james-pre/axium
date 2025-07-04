import { levelText } from 'logzen';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { deepAssign, omit, type PartialRecursive } from 'utilium';
import * as z from 'zod/v4';
import { _setDebugOutput, dirs, logger, output } from './io.js';
import { loadPlugin } from './plugins.js';

export interface Config extends Record<string, unknown> {
	api: {
		disable_metadata: boolean;
		cookie_auth: boolean;
	};
	apps: {
		disabled: string[];
	};
	auth: {
		origin: string;
		/** In minutes */
		passkey_probation: number;
		rp_id: string;
		rp_name: string;
		secure_cookies: boolean;
		/** In minutes */
		verification_timeout: number;
		/** Whether users can verify emails */
		email_verification: boolean;
	};
	db: {
		host: string;
		port: number;
		password: string;
		user: string;
		database: string;
	};
	debug: boolean;
	log: {
		level: (typeof levelText)[number];
		console: boolean;
	};
	web: {
		prefix: string;
		assets: string;
		secure: boolean;
		port: number;
		ssl_key: string;
		ssl_cert: string;
	};
}

export const configFiles = new Map<string, File>();

export function plainConfig(): Omit<Config, keyof typeof configShortcuts> {
	return omit(config, Object.keys(configShortcuts) as (keyof typeof configShortcuts)[]);
}

const configShortcuts = {
	findPath: findConfigPaths,
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
		cookie_auth: true,
	},
	apps: {
		disabled: [],
	},
	auth: {
		origin: 'https://test.localhost',
		passkey_probation: 60,
		rp_id: 'test.localhost',
		rp_name: 'Axium',
		secure_cookies: true,
		verification_timeout: 60,
		email_verification: false,
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
		assets: '/',
		secure: true,
		port: 443,
		ssl_key: resolve(dirs[0], 'ssl_key.pem'),
		ssl_cert: resolve(dirs[0], 'ssl_cert.pem'),
	},
};
export default config;

// config from file
export const File = z
	.looseObject({
		api: z
			.object({
				disable_metadata: z.boolean(),
				cookie_auth: z.boolean(),
			})
			.partial(),
		apps: z
			.object({
				disabled: z.array(z.string()),
			})
			.partial(),
		auth: z
			.object({
				origin: z.string(),
				/** In minutes */
				passkey_probation: z.number(),
				rp_id: z.string(),
				rp_name: z.string(),
				secure_cookies: z.boolean(),
				/** In minutes */
				verification_timeout: z.number(),
				/** Whether users can verify emails */
				email_verification: z.boolean(),
			})
			.partial(),
		db: z
			.object({
				host: z.string(),
				port: z.number(),
				password: z.string(),
				user: z.string(),
				database: z.string(),
			})
			.partial(),
		debug: z.boolean(),
		log: z
			.object({
				level: z.enum(levelText),
				console: z.boolean(),
			})
			.partial(),
		web: z
			.object({
				prefix: z.string(),
				assets: z.string(),
				secure: z.boolean(),
				port: z.number().min(1).max(65535),
				ssl_key: z.string(),
				ssl_cert: z.string(),
			})
			.partial(),
		include: z.array(z.string()).optional(),
		plugins: z.array(z.string()).optional(),
	})
	.partial();
export interface File extends PartialRecursive<Config>, z.infer<typeof File> {}

export function addConfigDefaults(other: PartialRecursive<Config>, _target: Record<string, any> = config): void {
	for (const [key, value] of Object.entries(other)) {
		if (!(key in _target) || _target[key] === null || _target[key] === undefined || Number.isNaN(_target[key])) {
			_target[key] = value;
			continue;
		}

		if (typeof value == 'object' && value != null && typeof _target[key] == 'object') {
			addConfigDefaults(value, _target[key]);
		}
	}
}

/**
 * Update the current config
 */
export function setConfig(other: PartialRecursive<Config>) {
	deepAssign(config, other);
	logger.detach(output);
	if (config.log.console) logger.attach(output, { output: config.log.level });
	_setDebugOutput(config.debug);
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
	if (configFiles.has(path)) return;

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
	output.debug('Loaded config: ' + path);
	for (const include of file.include ?? []) await loadConfig(join(dirname(path), include), { optional: true });
	for (const plugin of file.plugins ?? []) await loadPlugin(plugin.startsWith('.') ? resolve(dirname(path), plugin) : plugin);
}

export async function loadDefaultConfigs() {
	for (const path of findConfigPaths()) {
		if (!existsSync(path)) writeFileSync(path, '{}');
		await loadConfig(path, { optional: true });
	}
}

/**
 * Update the current config and write the updated config to the appropriate file
 */
export function saveConfig(changed: PartialRecursive<Config>, global: boolean = false) {
	saveConfigTo(findConfigPaths().at(global ? 0 : -1)!, changed);
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
export function findConfigPaths(): string[] {
	const paths = dirs.map(dir => join(dir, 'config.json'));
	if (process.env.AXIUM_CONFIG) paths.push(process.env.AXIUM_CONFIG);
	return paths;
}

if (process.env.AXIUM_CONFIG) await loadConfig(process.env.AXIUM_CONFIG);
