import type { Severity } from '@axium/core/audit';
import * as io from '@axium/core/node/io';
import { loadPlugin } from '@axium/core/node/plugins';
import { levelText } from 'logzen';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { capitalize, deepAssign, omit, type DeepRequired } from 'utilium';
import * as z from 'zod';
import { dirs, logger, systemDir } from './io.js';
import { _duplicateStateWarnings, _unique } from './state.js';

const audit_severity_levels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'] satisfies Lowercase<
	keyof typeof Severity
>[];

const z_audit_severity = z.literal([...audit_severity_levels, ...audit_severity_levels.map(capitalize)]);

export let ConfigSchema = z
	.looseObject({
		/** Whether /api/admin is enabled */
		admin_api: z.boolean(),
		allow_new_users: z.boolean(),
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
				/** In minutes */
				passkey_probation: z.number(),
				rp_id: z.string(),
				rp_name: z.string(),
				secure_cookies: z.boolean(),
				/** In minutes */
				verification_timeout: z.number(),
				/** Whether users can verify emails */
				email_verification: z.boolean(),
				/** Whether only the `Authorization` header can be used to authenticate requests. */
				header_only: z.boolean(),
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
		/** Whether to show a default home page for debugging */
		debug_home: z.boolean(),
		log: z
			.looseObject({
				level: z.enum(levelText),
				console: z.boolean(),
			})
			.partial(),
		origin: z.string(),
		request_size_limit: z.number().min(0).optional(),
		show_duplicate_state: z.boolean(),
		web: z
			.looseObject({
				disable_cache: z.boolean(),
				port: z.number().min(1).max(65535),
				prefix: z.string(),
				routes: z.string(),
				secure: z.boolean(),
				ssl_key: z.string(),
				ssl_cert: z.string(),
				build: z.string(),
			})
			.partial(),
	})
	.partial();

export function addConfig<T extends z.core.$ZodLooseShape>(shape: T) {
	ConfigSchema = z.looseObject({ ...ConfigSchema.shape, ...shape });
}

export interface Config extends z.infer<typeof ConfigSchema> {}

export const configFiles = _unique('configFiles', new Map<string, File>());

export function plainConfig(): Omit<DeepRequired<Config>, keyof typeof configShortcuts> {
	return omit(config, Object.keys(configShortcuts) as (keyof typeof configShortcuts)[]);
}

export const defaultConfig: DeepRequired<Config> = {
	admin_api: true,
	allow_new_users: true,
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
		passkey_probation: 60,
		rp_id: 'test.localhost',
		rp_name: 'Axium',
		secure_cookies: true,
		verification_timeout: 60,
		email_verification: false,
		header_only: false,
	},
	db: {
		database: process.env.PGDATABASE || 'axium',
		host: process.env.PGHOST || 'localhost',
		password: process.env.PGPASSWORD || '',
		port: process.env.PGPORT && Number.isSafeInteger(parseInt(process.env.PGPORT)) ? parseInt(process.env.PGPORT) : 5432,
		user: process.env.PGUSER || 'axium',
	},
	debug: await z
		.stringbool()
		.optional()
		.default(false)
		.parseAsync(process.env.AXIUM_DEBUG)
		.catch(() => false),
	debug_home: false,
	log: {
		console: true,
		level: 'info',
	},
	origin: 'https://test.localhost',
	show_duplicate_state: false,
	request_size_limit: 0,
	web: {
		disable_cache: false,
		port: 443,
		prefix: '',
		routes: 'routes',
		secure: true,
		ssl_key: resolve(dirs[0], 'ssl_key.pem'),
		ssl_cert: resolve(dirs[0], 'ssl_cert.pem'),
		build: '../build/handler.js',
	},
};

const configShortcuts = {
	findPath: findConfigPaths,
	load: loadConfig,
	loadDefaults: loadDefaultConfigs,
	plain: plainConfig,
	save: saveConfig,
	saveTo: saveConfigTo,
	set: setConfig,
	files: configFiles,
	defaults: defaultConfig,
};

export const config: DeepRequired<Config> & typeof configShortcuts = _unique('config', {
	...configShortcuts,
	...defaultConfig,
});
export default config;

// config from file
export const FileSchema = z
	.looseObject({
		...ConfigSchema.shape,
		include: z.string().array(),
		plugins: z.string().array(),
	})
	.partial();
export interface File extends z.infer<typeof FileSchema> {}

export function addConfigDefaults(other: Config, _target: Record<string, any> = config, _noDefault: boolean = false): void {
	if (!_noDefault) deepAssign(defaultConfig, other);

	for (const [key, value] of Object.entries(other)) {
		if (!(key in _target) || _target[key] === null || _target[key] === undefined || Number.isNaN(_target[key])) {
			_target[key] = value;
			continue;
		}

		if (typeof value == 'object' && value != null && typeof _target[key] == 'object') {
			addConfigDefaults(value as any, _target[key], true);
		}
	}
}

/**
 * Update the current config
 */
export function setConfig(other: Config) {
	deepAssign(config, other);
	logger.detach(io);
	if (config.log.console) logger.attach(io, { output: config.log.level });
	io._setDebugOutput(config.debug);
	_duplicateStateWarnings(config.show_duplicate_state);
}

const kWasIncluded = Symbol.for('_wasIncluded');

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
	 * If enabled, code from plugins will not be executed.
	 */
	safe?: boolean;

	/**
	 * If `optional`, this function will be called with the error if the config file is invalid or can't be read.
	 */
	onError?(error: Error): void;

	/**
	 * Used to mark included files
	 * @internal
	 */
	_markIncluded?: boolean;
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
		if (path == join(systemDir, 'config.json') && 'code' in e && e.code === 'ENOENT') {
			try {
				writeFileSync(path, '{}');
			} catch (e: any) {
				io.warn('Failed to create the main configuration file (/etc/axium/config.json): ' + e.message);
				return;
			}
			io.debug('Created main configuration file (fresh install?)');
			return;
		}
		if (!options.optional) throw e;
		io.debug(`Skipping config at ${path} (${e.message})`);
		return;
	}

	let file: File;
	try {
		file = FileSchema.parse(json);
		if (file.web?.build) file.web.build = resolve(dirname(path), file.web.build);
	} catch (e: any) {
		if (!options.loose) throw e;
		io.debug(`Loading invalid config from ${path} (${e.message})`);
		file = json;
	}
	configFiles.set(path, { ...file, [kWasIncluded]: !!options._markIncluded });
	setConfig(file);
	io.debug('Loaded config: ' + path);
	for (const include of file.include ?? [])
		await loadConfig(resolve(dirname(path), include), { ...options, optional: true, _markIncluded: true });
	for (const pluginPath of file.plugins ?? []) {
		const plugin = await loadPlugin('server', pluginPath, path, options.safe);
		if (!plugin) continue;
	}
}

export async function loadDefaultConfigs(safe: boolean = false) {
	for (const path of findConfigPaths()) {
		if (!existsSync(path)) {
			try {
				writeFileSync(path, '{}');
			} catch {
				continue;
			}
		}
		await loadConfig(path, { optional: true, safe });
	}
}

export async function reloadConfigs(safe: boolean = false) {
	const paths = Array.from(
		configFiles
			.entries()
			.filter(([, cfg]) => !cfg[kWasIncluded as any])
			.map(([p]) => p)
	);
	configFiles.clear();
	setConfig(defaultConfig);
	for (const path of paths) await loadConfig(path, { safe });
	io.info('Reloaded configuration files');
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

	io.debug(`Wrote config to ${path}`);
	writeFileSync(path, JSON.stringify(config));
}

/**
 * Find the path to the config file(s)
 * This array should roughly be in the order of most global to most local.
 */
export function findConfigPaths(): string[] {
	const paths = dirs.map(dir => join(dir, 'config.json'));
	if (process.env.AXIUM_CONFIG && !paths.includes(process.env.AXIUM_CONFIG)) paths.push(process.env.AXIUM_CONFIG);
	return paths;
}
