#!/usr/bin/env node
import chalk from 'chalk';
import { Option, program, type Command } from 'commander';
import $pkg from '../package.json' with { type: 'json' };
import * as config from './config.js';
import * as db from './database.js';
import { err, exit, setVerbose } from './io.js';

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({
		showGlobalOptions: true,
	})
	.option('-v, --verbose', 'verbose output', false)
	.option('-c, --config <path>', 'path to the config file');

program.on('option:verbose', () => setVerbose(program.opts<OptCommon>().verbose));
program.on('option:config', () => config.load(program.opts<OptCommon>().config));

program.hook('preAction', function (_, action: Command) {
	config.loadDefaults();
	const opt = action.optsWithGlobals<OptCommon>();
	opt.verbose && opt.force && console.log(chalk.yellow('--force: Protections disabled.'));
});

// Options shared by multiple (sub)commands
const opts = {
	// database specific
	host: new Option('-H, --host <host>', 'the host of the database.').default('localhost:5432'),
	force: new Option('-f, --force', 'force the operation').default(false),

	// config
	global: new Option('-g, --global', 'Apply to global config').default(false),
};

interface OptCommon {
	verbose: boolean;
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
	.action(async (opt: Omit<OptDB, 'force'>) =>
		db
			.statusText(opt)
			.then(console.log)
			.catch(() => exit('Unavailable'))
	);

axiumDB
	.command('drop')
	.description('drop the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		db.normalizeConfig(opt);

		const stats = await db.status(opt).catch(exit);

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
}

program
	.command('enable')
	.description('enable an authentication provider')
	.addOption(opts.global)
	.argument('<provider>', 'the provider to enable')
	.action((provider: string, opt: OptConfig) => {
		if (!config.authProviders.includes(provider as any)) exit(`Invalid provider: ${provider}`);
		config.save({ [provider]: true }, opt.global);
	});

program
	.command('disable')
	.description('disable an authentication provider')
	.addOption(opts.global)
	.argument('<provider>', 'the provider to disable')
	.action((provider: string, opt: OptConfig) => {
		if (!config.authProviders.includes(provider as any)) exit(`Invalid provider: ${provider}`);
		config.save({ [provider]: false }, opt.global);
	});

program
	.command('status')
	.alias('stats')
	.description('get information about the server')
	.addOption(opts.host)
	.action(async (opt: OptCommon & { host: string }) => {
		console.log('Axium Server v' + program.version());

		process.stdout.write('Database: ');
		await db
			.statusText(opt)
			.then(console.log)
			.catch(() => err('Unavailable'));

		console.log('Enabled auth providers:', config.authProviders.filter(provider => config[provider]).join(', '));

		console.log('Debug mode:', config.debug ? chalk.yellow('Enabled') : 'Disabled');
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
