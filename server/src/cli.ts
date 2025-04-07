#!/usr/bin/env node
import chalk from 'chalk';
import { Option, program, type Command } from 'commander';
import { getByString, isJSON, pick, setByString } from 'utilium';
import $pkg from '../package.json' with { type: 'json' };
import * as config from './config.js';
import * as db from './database.js';
import { err, exit } from './io.js';

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('-D, --debug', 'override debug mode', false)
	.option('-c, --config <path>', 'path to the config file');

program.on('option:debug', () => config.set(pick(program.opts<OptCommon>(), 'debug')));
program.on('option:config', () => config.load(program.opts<OptCommon>().config));

program.hook('preAction', function (_, action: Command) {
	config.loadDefaults();
	const opt = action.optsWithGlobals<OptCommon>();
	opt.force && console.log(chalk.yellow('--force: Protections disabled.'));
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

function db_output(state: db.OpOutputState, message?: string) {
	switch (state) {
		case 'start':
			process.stdout.write(message + '... ');
			break;
		case 'log':
		case 'warn':
			process.stdout.write(chalk.yellow(message));
			break;
		case 'error':
			process.stdout.write(chalk.red(message));
			break;
		case 'done':
			console.log('done.');
			break;
	}
}

axiumDB
	.command('init')
	.description('initialize the database')
	.addOption(opts.force)
	.option('-s, --skip', 'Skip existing database and/or user')
	.action(async (opt: OptDB & { skip: boolean }) => {
		await db.init({ ...opt, output: db_output }).catch((e: number | string | Error) => {
			if (typeof e == 'number') process.exit(e);
			else exit(e);
		});
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('check the status of the database')
	.action(async () =>
		db
			.statusText()
			.then(console.log)
			.catch(() => exit('Unavailable'))
	);

axiumDB
	.command('drop')
	.description('drop the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		const stats = await db.status().catch(exit);

		if (!opt.force)
			for (const key of ['users', 'accounts', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				console.warn(chalk.yellow(`Database has existing ${key}. Use --force if you really want to drop the database.`));
				process.exit(2);
			}

		await db.remove({ ...opt, output: db_output }).catch(exit);
	});

interface OptConfig extends OptCommon {
	global: boolean;
	json: boolean;
}

const axiumConfig = program
	.command('config')
	.alias('conf')
	.description('manage the configuration')
	.option('-j, --json', 'values are JSON encoded')
	.option('-g, --global', 'apply to the global config');

axiumConfig
	.command('dump')
	.description('Output the entire current configuration')
	.action(() => {
		const value = config.get();
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

		console.log('Debug mode:', config.debug ? chalk.yellow('enabled') : 'disabled');

		console.log('Loaded config files:', config.files.keys().toArray().join(', '));

		process.stdout.write('Database: ');
		await db
			.statusText()
			.then(console.log)
			.catch(() => err('Unavailable'));

		console.log('Enabled auth providers:', config.authProviders.filter(provider => config.auth[provider]).join(', '));
	});

program
	.command('init')
	.description('Install Axium server')
	.addOption(opts.force)
	.addOption(opts.host)
	.action(async (opt: OptDB & { dbSkip: boolean }) => {
		await db.init({ ...opt, skip: opt.dbSkip, output: db_output }).catch((e: number | string | Error) => {
			if (typeof e == 'number') process.exit(e);
			else exit(e);
		});
	});

program.parse();
