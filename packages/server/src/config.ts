import { serverConfigs, toBaseName } from '@axium/core';
import type { Severity } from '@axium/core/audit';
import { Id as FeatureId } from '@axium/core/features';
import { loadPlugin, type PluginLoadOptions } from '@axium/core/node/plugins';
import * as jpConfig from '@james-pre/config';
import * as io from 'ioium/node';
import { levelText } from 'logzen';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { deepAssign } from 'utilium';
import * as z from 'zod';
import * as cfg from './config_types.js';
import { MxConfig } from './email.js';
import { dirs, logger, systemDir } from './io.js';
import { _duplicateStateWarnings, _unique } from './state.js';

const audit_severity_levels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'] satisfies Lowercase<
	keyof typeof Severity
>[];

export const ImageUploadConfig = z.object({
	/** Whether images can be uploaded */
	enabled: cfg.bool,
	/** Max image size in KB. Set to zero for no limit */
	max_size: z.coerce.number().min(0),
	/** Max dimensions on a side. Set to zero for no limit */
	max_length: z.coerce.number().int().min(0),
});
export interface ImageUploadConfig extends z.infer<typeof ImageUploadConfig> {}

export interface LoadOptions extends jpConfig.LoadOptions {
	plugins: PluginLoadOptions;
}

const schema = z.looseObject({
	/** Whether /api/admin is enabled */
	admin_api: cfg.bool.default(true),
	allow_new_users: cfg.bool.default(true),
	apps: z.looseObject({
		disabled: z.array(z.string()).default([]),
	}),
	audit: z.looseObject({
		allow_raw: cfg.bool.default(false),
		/** How many days to keep events in the audit log */
		retention: z.coerce.number().min(0).default(30),
		/** Minimum severity level. Less severe events will be ignored. */
		min_severity: z.literal(audit_severity_levels).default('notice'),
		auto_suspend: z.literal(audit_severity_levels).default('critical'),
	}),
	auth: z.looseObject({
		/** In minutes */
		passkey_probation: z.coerce.number().default(60),
		/** Account recovery */
		recovery: z.looseObject({
			/** Whether account recovery is enabled */
			enabled: cfg.bool.default(true),
			/** Whether accounts can be recovered using an email */
			email: cfg.bool.default(true),
		}),
		rp_id: z.string().default('test.localhost'),
		rp_name: z.string().default('Axium'),
		secure_cookies: cfg.bool.default(true),
		/** Whether only the `Authorization` header can be used to authenticate requests. */
		header_only: cfg.bool.default(false),
	}),
	db: z.looseObject({
		host: z.string().default(process.env.PGHOST || 'localhost'),
		port: cfg.port.default(
			process.env.PGPORT && Number.isSafeInteger(parseInt(process.env.PGPORT)) ? parseInt(process.env.PGPORT) : 5432
		),
		password: z.string().default(process.env.PGPASSWORD || ''),
		user: z.string().default(process.env.PGUSER || 'axium'),
		database: z.string().default(process.env.PGDATABASE || 'axium'),
	}),
	debug: cfg.bool.default(z.stringbool().safeParse(process.env.AXIUM_DEBUG).data || false),
	/** Whether to show a default home page for debugging */
	debug_home: cfg.bool.default(false),
	email: z.object({
		enabled: cfg.bool.default(true),
		/** SMTP relay. If no host is set, mail is delivered directly to the recipient's MX. */
		relay: MxConfig.default({
			host: '',
			port: 587,
			auth: { user: '', pass: '' },
			secure: false,
		}),
		dkim: z.object({
			selector: z.string().default('axium'),
			/** Path to the DKIM private key. Generate one with `axium dkim-keygen`. */
			key_file: z.string().default(resolve(systemDir, 'dkim_key.pem')),
		}),
	}),
	log: z.looseObject({
		level: z.enum(levelText).default('info'),
		console: cfg.bool.default(true),
	}),
	origin: z.string().default('https://localhost'),
	request_size_limit: z.coerce.number().min(0).optional().default(0),
	show_duplicate_state: cfg.bool.default(false),
	/** Who can use the user discovery API. For example, setting to `admin` means regular users need to type a full email in the ACL dialog and won't be shown results */
	user_discovery: z.literal(['disabled', 'admin', 'user', 'public']).default('user'),
	/** Configuration for user profile pictures */
	user_pfp: ImageUploadConfig.loose().default({
		enabled: true,
		max_size: 500,
		max_length: 750,
	}),
	verifications: z.looseObject({
		/** In minutes */
		timeout: z.coerce.number().default(60),
	}),
	web: z.looseObject({
		disable_cache: cfg.bool.default(false),
		port: cfg.port.default(443),
		prefix: z.string().default(''),
		routes: z.string().default('routes'),
		secure: cfg.bool.default(true),
		ssl_key: z.string().default(resolve(systemDir, 'ssl_key.pem')),
		ssl_cert: z.string().default(resolve(systemDir, 'ssl_cert.pem')),
		build: z.string().default('../build/handler.js'),
	}),
	features: z.record(FeatureId, cfg.bool.nullish()).default({}),
	plugins: z.string().array().default([]),
});

export const configManager = _unique(
	'config',
	new jpConfig.Manager<LoadOptions, typeof schema>(schema, { enableIncludes: true, system: 'axium' })
)
	.on('change', () => {
		logger.detach(io);
		if (config.log.console) logger.attach(io, { output: config.log.level });
		io._setDebugOutput(config.debug);
		_duplicateStateWarnings(config.show_duplicate_state);
	})
	.on('create', path => io.debug('Created config file', path))
	.on('write', path => io.debug('Wrote config to', path))
	.on('reload', () => io.info('Reloaded configuration files'))
	.on('load_error', (path, stage, error) => {
		switch (stage) {
			case 'create':
				return io.debug('Failed to create configuration file:', error.message);
			case 'read':
				return io.debug(`Can not load invalid configuration file ${path}: ${error.message}`);
			case 'parse':
				return io.debug(`Loading invalid config from ${path} (${error.message})`);
		}
	})
	.on('load', (path, file) => {
		io.debug('Loaded config:', path);
		if (file.web?.build) file.web.build = resolve(dirname(path), file.web.build);
	})
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	.on('post_load', async (path, file, options) => {
		for (const pluginPath of file.plugins ?? []) {
			const plugin = await loadPlugin('server', pluginPath, path, options.plugins);
			if (!plugin) continue;
			const serverConfig = serverConfigs.get(plugin.name);
			if (serverConfig) {
				plugin.config ||= {};
				let configPath;
				for (const dir of dirs) {
					configPath = join(dir, 'plugins', toBaseName(plugin.name) + '.json');
					if (!existsSync(configPath)) continue;

					try {
						const data = io.readJSON(configPath, serverConfig.partial());
						deepAssign(plugin.config, data, { replaceArrays: true });
						io.debug(`Loaded config for plugin ${plugin.name} from ${configPath}`);
					} catch (e: any) {
						io.warn(`Failed to load config for plugin ${plugin.name} at ${configPath}: ${e}`);
					}
				}
				plugin._configPath = configPath;
			}
		}
	});

export function hostname(): string {
	return new URL(config.origin).hostname;
}

export const config = configManager.data;

export default config;

/**
 * Find the path to the config file(s)
 * This array should roughly be in the order of most global to most local.
 */
export function findConfigPaths(): string[] {
	const paths = dirs.map(dir => join(dir, 'config.json'));
	if (process.env.AXIUM_CONFIG && !paths.includes(process.env.AXIUM_CONFIG)) paths.push(process.env.AXIUM_CONFIG);
	return paths;
}

export function loadConfigFromDirs(options: Partial<LoadOptions>) {
	for (const path of findConfigPaths()) {
		configManager.loadFile(path, { ...options, optional: true });
	}
}
