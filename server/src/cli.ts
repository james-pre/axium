#!/usr/bin/env node
import { Argument, Option, program, type Command } from 'commander';
import { styleText } from 'node:util';
import { getByString, isJSON, setByString } from 'utilium';
import $pkg from '../package.json' with { type: 'json' };
import { apps } from './apps.js';
import config, { configFiles, saveConfigTo } from './config.js';
import * as db from './database.js';
import { _portActions, _portMethods, defaultOutput, exit, handleError, output, restrictedPorts, type PortOptions } from './io.js';
import { getSpecifier, loadDefaultPlugins, plugins, pluginText, resolvePlugin } from './plugins.js';
import serve from './serve.js';
import { join } from 'node:path/posix';

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('-c, --config <path>', 'path to the config file');

program.on('option:debug', () => config.set({ debug: true }));
program.on('option:config', () => void config.load(program.opts<OptCommon>().config));

program.hook('preAction', async function (_, action: Command) {
	await config.loadDefaults();
	await loadDefaultPlugins();
	const opt = action.optsWithGlobals<OptCommon>();
	opt.force && output.warn('--force: Protections disabled.');
	if (opt.debug === false) config.set({ debug: false });
});

// Options shared by multiple (sub)commands
const opts = {
	// database specific
	host: new Option('-H, --host <host>', 'the host of the database.').argParser(value => {
		const [hostname, port] = value?.split(':') ?? [];
		config.db.host = hostname || config.db.host;
		config.db.port = port && Number.isSafeInteger(parseInt(port)) ? parseInt(port) : config.db.port;
	}),
	force: new Option('-f, --force', 'force the operation').default(false),
	global: new Option('-g, --global', 'apply the operation globally').default(false),
};

interface OptCommon {
	debug: boolean;
	config: string;
	force?: boolean;
}

const axiumDB = program
	.command('db')
	.alias('database')
	.description('Manage the database')
	.option('-t, --timeout <ms>', 'how long to wait for commands to complete.', '1000')
	.addOption(opts.host);

interface OptDB extends OptCommon {
	host: string;
	timeout: number;
	force: boolean;
}

axiumDB
	.command('init')
	.description('Initialize the database')
	.addOption(opts.force)
	.option('-s, --skip', 'If the user, database, or schema already exists, skip trying to create it.')
	.action(async (opt: OptDB & { skip: boolean }) => {
		await db.init(opt).catch(handleError);
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('Check the status of the database')
	.action(async () => {
		try {
			console.log(await db.statusText());
		} catch {
			output.error('Unavailable');
			process.exitCode = 1;
		} finally {
			await db.database.destroy();
		}
	});

axiumDB
	.command('drop')
	.description('Drop the Axium database and user')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		await using _ = db.connect();
		const stats = await db.status().catch(exit);

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				output.warn(`Database has existing ${key}. Use --force if you really want to drop the database.`);
				process.exit(2);
			}

		await db.uninstall(opt).catch(exit);
	});

axiumDB
	.command('wipe')
	.description('Wipe the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		await using _ = db.connect();
		const stats = await db.status().catch(exit);

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				output.warn(`Database has existing ${key}. Use --force if you really want to wipe the database.`);
				process.exit(2);
			}

		await db.wipe(opt).catch(exit);
	});

axiumDB
	.command('check')
	.description('Check the structure of the database')
	.action(async (opt: OptDB) => {
		await db.check(opt).catch(exit);
	});

axiumDB
	.command('clean')
	.description('Remove expired rows')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		await using _ = db.connect();
		await db.clean(opt).catch(exit);
	});

interface OptConfig extends OptCommon {
	global: boolean;
	json: boolean;
	redact: boolean;
}

const axiumConfig = program
	.command('config')
	.description('Manage the configuration')
	.addOption(opts.global)
	.option('-j, --json', 'values are JSON encoded')
	.option('-r, --redact', 'Do not output sensitive values');

function configReplacer(opt: OptConfig) {
	return (key: string, value: any) => {
		return opt.redact && ['password', 'secret'].includes(key) ? '[redacted]' : value;
	};
}

axiumConfig
	.command('dump')
	.description('Output the entire current configuration')
	.action(() => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		const value = config.plain();
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('get')
	.description('Get a config value')
	.argument('<key>', 'the key to get')
	.action((key: string) => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		const value = getByString(config.plain(), key);
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('set')
	.description('Set a config value. Note setting objects is not supported.')
	.argument('<key>', 'the key to set')
	.argument('<value>', 'the value')
	.action((key: string, value: string) => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		if (opt.json && !isJSON(value)) exit('Invalid JSON');
		const obj: Record<string, any> = {};
		setByString(obj, key, opt.json ? JSON.parse(value) : value);
		config.save(obj, opt.global);
	});

axiumConfig
	.command('list')
	.alias('ls')
	.alias('files')
	.description('List loaded config files')
	.action(() => {
		for (const path of config.files.keys()) console.log(path);
	});

const axiumPlugin = program.command('plugins').description('Manage plugins').addOption(opts.global);

axiumPlugin
	.command('list')
	.alias('ls')
	.description('List loaded plugins')
	.option('-l, --long', 'use the long listing format')
	.option('--no-versions', 'do not show plugin versions')
	.action((opt: OptCommon & { long: boolean; versions: boolean }) => {
		if (!plugins.size) {
			console.log('No plugins loaded.');
			return;
		}

		if (!opt.long) {
			console.log(
				Array.from(plugins)
					.map(plugin => plugin.name)
					.join(', ')
			);
			return;
		}

		console.log(styleText('whiteBright', plugins.size + ' plugin(s) loaded:'));

		for (const plugin of plugins) {
			console.log(plugin.name, styleText('dim', `(${plugin.id})`), opt.versions ? plugin.version : '');
		}
	});

axiumPlugin
	.command('info')
	.description('Get information about a plugin')
	.argument('<plugin>', 'the plugin to get information about')
	.action((search: string) => {
		const plugin = resolvePlugin(search);
		if (!plugin) exit(`Can't find a plugin matching "${search}"`);
		console.log(pluginText(plugin));
	});

axiumPlugin
	.command('remove')
	.alias('rm')
	.description('Remove a plugin')
	.argument('<plugin>', 'the plugin to remove')
	.action(async (search: string, opt: OptCommon & { safe: boolean }) => {
		const plugin = resolvePlugin(search);
		if (!plugin) exit(`Can't find a plugin matching "${search}"`);

		const specifier = getSpecifier(plugin);

		await using _ = db.connect();

		await plugin.db_remove?.({ ...opt, output: defaultOutput }, db.database);

		for (const [path, data] of configFiles) {
			if (!data.plugins) continue;

			data.plugins = data.plugins.filter(p => p !== specifier);
			saveConfigTo(path, data);
		}

		plugins.delete(plugin);
	});

const axiumApps = program.command('apps').description('Manage Axium apps').addOption(opts.global);

axiumApps
	.command('list')
	.alias('ls')
	.description('List apps added by plugins')
	.option('-l, --long', 'use the long listing format')
	.option('-b, --builtin', 'include built-in apps')
	.action((opt: OptCommon & { long: boolean; builtin: boolean }) => {
		if (!apps.size) {
			console.log('No apps.');
			return;
		}

		if (!opt.long) {
			console.log(Array.from(apps.values().map(app => app.name)).join(', '));
			return;
		}

		console.log(styleText('whiteBright', apps.size + ' app(s) loaded:'));
		for (const app of apps.values()) {
			console.log(app.name, styleText('dim', `(${app.id})`));
		}
	});

program
	.command('status')
	.alias('stats')
	.description('Get information about the server')
	.addOption(opts.host)
	.action(async () => {
		console.log('Axium Server v' + program.version());

		console.log(styleText('whiteBright', 'Debug mode:'), config.debug ? styleText('yellow', 'enabled') : 'disabled');

		console.log(styleText('whiteBright', 'Loaded config files:'), config.files.keys().toArray().join(', '));

		process.stdout.write(styleText('whiteBright', 'Database: '));

		await using _ = db.connect();

		try {
			console.log(await db.statusText());
		} catch {
			output.error('Unavailable');
		}

		console.log(
			styleText('whiteBright', 'Loaded plugins:'),
			Array.from(plugins)
				.map(plugin => plugin.id)
				.join(', ') || styleText('dim', '(none)')
		);

		for (const plugin of plugins) {
			if (!plugin.statusText) continue;
			console.log(styleText('bold', plugin.name), plugin.version + ':');
			console.log(await plugin.statusText());
		}
	});

program
	.command('ports')
	.description('Enable or disable use of restricted ports (e.g. 443)')
	.addArgument(new Argument('<action>', 'The action to take').choices(_portActions))
	.addOption(new Option('-m, --method <method>', 'the method to use').choices(_portMethods).default('node-cap'))
	.option('-N, --node <path>', 'the path to the node binary')
	.action(async (action: PortOptions['action'], opt: OptCommon & Omit<PortOptions, 'action'>) => {
		await restrictedPorts({ ...opt, action }).catch(handleError);
	});

program
	.command('init')
	.description('Install Axium server')
	.addOption(opts.force)
	.addOption(opts.host)
	.action(async (opt: OptDB & { dbSkip: boolean }) => {
		await db.init({ ...opt, skip: opt.dbSkip }).catch(handleError);
		await restrictedPorts({ method: 'node-cap', action: 'enable' }).catch(handleError);
	});

program
	.command('serve')
	.description('Start the Axium server')
	.option('-p, --port <port>', 'the port to listen on')
	.option('--ssl <prefix>', 'the prefix for the cert.pem and key.pem SSL files')
	.action((opt: OptCommon & { ssl?: string; port?: string }) => {
		const server = serve({
			secure: opt.ssl ? true : config.web.secure,
			ssl_cert: opt.ssl ? join(opt.ssl, 'cert.pem') : config.web.ssl_cert,
			ssl_key: opt.ssl ? join(opt.ssl, 'key.pem') : config.web.ssl_key,
		});

		const port = !Number.isNaN(Number.parseInt(opt.port ?? '')) ? Number.parseInt(opt.port!) : config.web.port;

		server.listen(port, () => {
			console.log('Server is listening on port ' + port);
		});
	});

program.parse();
