#!/usr/bin/env node
import { Argument, Option, program, type Command } from 'commander';
import { styleText } from 'node:util';
import { getByString, isJSON, setByString } from 'utilium';
import $pkg from '../package.json' with { type: 'json' };
import config from './config.js';
import * as db from './database.js';
import { _portActions, _portMethods, exit, handleError, output, restrictedPorts, type PortOptions } from './io.js';

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('-c, --config <path>', 'path to the config file');

program.on('option:debug', () => config.set({ debug: true }));
program.on('option:config', () => config.load(program.opts<OptCommon>().config));

program.hook('preAction', function (_, action: Command) {
	config.loadDefaults();
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
};

interface OptCommon {
	debug: boolean;
	config: string;
	force?: boolean;
}

const axiumDB = program
	.command('db')
	.alias('database')
	.description('manage the database')
	.option('-t, --timeout <ms>', 'how long to wait for commands to complete.', '1000')
	.addOption(opts.host);

interface OptDB extends OptCommon {
	host: string;
	timeout: number;
	force: boolean;
}

axiumDB
	.command('init')
	.description('initialize the database')
	.addOption(opts.force)
	.option('-s, --skip', 'Skip existing database and/or user')
	.action(async (opt: OptDB & { skip: boolean }) => {
		await db.init(opt).catch(handleError);
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('check the status of the database')
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
	.description('drop the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		const stats = await db.status().catch(exit);

		if (!opt.force)
			for (const key of ['users', 'accounts', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				output.warn(`Database has existing ${key}. Use --force if you really want to drop the database.`);
				process.exit(2);
			}

		await db.uninstall(opt).catch(exit);
		await db.database.destroy();
	});

axiumDB
	.command('wipe')
	.description('wipe the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		const stats = await db.status().catch(exit);

		if (!opt.force)
			for (const key of ['users', 'accounts', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				output.warn(`Database has existing ${key}. Use --force if you really want to wipe the database.`);
				process.exit(2);
			}

		await db.wipe(opt).catch(exit);
		await db.database.destroy();
	});

interface OptConfig extends OptCommon {
	global: boolean;
	json: boolean;
}

const axiumConfig = program
	.command('config')
	.description('manage the configuration')
	.option('-j, --json', 'values are JSON encoded')
	.option('-g, --global', 'apply to the global config');

axiumConfig
	.command('dump')
	.description('Output the entire current configuration')
	.action(() => {
		const value = config;
		console.log(axiumConfig.optsWithGlobals<OptConfig>().json ? JSON.stringify(value) : value);
	});

axiumConfig
	.command('get')
	.description('get a config value')
	.argument('<key>', 'the key to get')
	.action((key: string) => {
		const value = getByString(config, key);
		console.log(axiumConfig.optsWithGlobals<OptConfig>().json ? JSON.stringify(value) : value);
	});

axiumConfig
	.command('set')
	.description('Set a config value. Note setting objects is not supported.')
	.argument('<key>', 'the key to set')
	.argument('<value>', 'the value')
	.action((key: string, value: string, opt: OptConfig) => {
		const useJSON = axiumConfig.optsWithGlobals<OptConfig>().json;
		if (useJSON && !isJSON(value)) exit('Invalid JSON');
		const obj: Record<string, any> = {};
		setByString(obj, key, useJSON ? JSON.parse(value) : value);
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

program
	.command('status')
	.alias('stats')
	.description('get information about the server')
	.addOption(opts.host)
	.action(async () => {
		console.log('Axium Server v' + program.version());

		console.log('Debug mode:', config.debug ? styleText('yellow', 'enabled') : 'disabled');

		console.log('Loaded config files:', config.files.keys().toArray().join(', '));

		process.stdout.write('Database: ');

		try {
			console.log(await db.statusText());
		} catch {
			output.error('Unavailable');
		}
		await db.database.destroy();

		console.log('Credentials authentication:', config.auth.credentials ? styleText('yellow', 'enabled') : 'disabled');
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

program.parse();
