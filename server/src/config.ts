import { levelText } from 'logzen';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { capitalize, deepAssign, omit, type DeepRequired } from 'utilium';
import * as z from 'zod';
import type { Severity } from './audit.js';
import { _setDebugOutput, dirs, logger, output } from './io.js';
import { loadPlugin } from './plugins.js';
import { _duplicateStateWarnings, _unique } from './state.js';

const audit_severity_levels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'] satisfies Lowercase<
	keyof typeof Severity
>[];

const z_audit_severity = z.literal([...audit_severity_levels, ...audit_severity_levels.map(capitalize)]);

export const ConfigSchema = z
	.looseObject({
		allow_new_users: z.boolean(),
		api: z
			.looseObject({
				disable_metadata: z.boolean(),
				cookie_auth: z.boolean(),
			})
			.partial(),
		apps: z
			.looseObject({
				disabled: z.array(z.string()),
			})
			.partial(),
		audit: z
			.looseObject({
				allow_raw: z.boolean(),
				/** How many days to keep events in the audit log */
				retention: z.number().min(0),
				min_severity: z_audit_severity,
				auto_suspend: z_audit_severity,
			})
			.partial(),
		auth: z
			.looseObject({
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
			.looseObject({
				host: z.string(),
				port: z.number(),
				password: z.string(),
				user: z.string(),
				database: z.string(),
			})
			.partial(),
		debug: z.boolean(),
		log: z
			.looseObject({
				level: z.enum(levelText),
				console: z.boolean(),
			})
			.partial(),
		show_duplicate_state: z.boolean(),
		web: z
			.looseObject({
				assets: z.string(),
				build: z.string(),
				disable_cache: z.boolean(),
				port: z.number().min(1).max(65535),
				prefix: z.string(),
				routes: z.string(),
				secure: z.boolean(),
				ssl_key: z.string(),
				ssl_cert: z.string(),
				template: z.string(),
			})
			.partial(),
	})
	.partial();

export interface Config extends z.infer<typeof ConfigSchema> {}

export const configFiles = _unique('configFiles', new Map<string, File>());

export function plainConfig(): Omit<DeepRequired<Config>, keyof typeof configShortcuts> {
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

export const config: DeepRequired<Config> & typeof configShortcuts = _unique('config', {
	...configShortcuts,
	allow_new_users: true,
	api: {
		disable_metadata: false,
		cookie_auth: true,
	},
	apps: {
		disabled: [],
	},
	audit: {
		allow_raw: false,
		retention: 30,
		min_severity: 'error',
		auto_suspend: 'critical',
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
	show_duplicate_state: false,
	web: {
		assets: '',
		build: '../build/handler.js',
		disable_cache: false,
		port: 443,
		prefix: '',
		routes: 'routes',
		secure: true,
		ssl_key: resolve(dirs[0], 'ssl_key.pem'),
		ssl_cert: resolve(dirs[0], 'ssl_cert.pem'),
		template: join(import.meta.dirname, '../web/template.html'),
	},
});
export default config;

// config from file
export const FileSchema = z
	.looseObject({
		...ConfigSchema.shape,
		include: z.array(z.string()),
		plugins: z.array(z.string()),
	})
	.partial();
export interface File extends z.infer<typeof FileSchema> {}

export function addConfigDefaults(other: Config, _target: Record<string, any> = config): void {
	for (const [key, value] of Object.entries(other)) {
		if (!(key in _target) || _target[key] === null || _target[key] === undefined || Number.isNaN(_target[key])) {
			_target[key] = value;
			continue;
		}

		if (typeof value == 'object' && value != null && typeof _target[key] == 'object') {
			addConfigDefaults(value as any, _target[key]);
		}
	}
}

/**
 * Update the current config
 */
export function setConfig(other: Config) {
	deepAssign(config, other);
	logger.detach(output);
	if (config.log.console) logger.attach(output, { output: config.log.level });
	_setDebugOutput(config.debug);
	_duplicateStateWarnings(config.show_duplicate_state);
}

export interface LoadOptions {
	/**
	 * If enabled, the config file will still be loaded if it does not match the schema.
	 */
	loose?: boolean;

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
		output.debug(`Skipping config at ${path} (${e.message})`);
		return;
	}

	let file: File;
	try {
		file = FileSchema.parse(json);
	} catch (e: any) {
		if (!options.loose) throw e;
		output.debug(`Loading invalid config from ${path} (${e.message})`);
		file = json;
	}
	configFiles.set(path, file);
	setConfig(file);
	output.debug('Loaded config: ' + path);
	for (const include of file.include ?? []) await loadConfig(join(dirname(path), include), { optional: true });
	for (const plugin of file.plugins ?? []) await loadPlugin(plugin.startsWith('.') ? resolve(dirname(path), plugin) : plugin);
}

export async function loadDefaultConfigs() {
	for (const path of findConfigPaths()) {
		if (!existsSync(path)) {
			try {
				writeFileSync(path, '{}');
			} catch {
				continue;
			}
		}
		await loadConfig(path, { optional: true });
	}
}

/**
 * Update the current config and write the updated config to the appropriate file
 */
export function saveConfig(changed: Config, global: boolean = false) {
	saveConfigTo(findConfigPaths().at(global ? 0 : -1)!, changed);
}

/**
 * Update the current config and write the updated config to the provided path
 */
export function saveConfigTo(path: string, changed: Config) {
	setConfig(changed);
	const config = configFiles.get(path) ?? {};
	Object.assign(config, { ...changed, db: { ...config.db, ...changed.db } });

	output.debug(`Wrote config to ${path}`);
	writeFileSync(path, JSON.stringify(config));
}

/**
 * Find the path to the config file(s)
 * This array should roughly be in the order of most global to most local.
 */
export function findConfigPaths(): string[] {
	const paths = dirs.map(dir => join(dir, 'config.json'));
	if (process.env.AXIUM_CONFIG) paths.push(process.env.AXIUM_CONFIG);
	return paths;
}

if (process.env.AXIUM_CONFIG) await loadConfig(process.env.AXIUM_CONFIG);
