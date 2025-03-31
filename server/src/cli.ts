#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-empty-object-type */
import chalk from 'chalk';
import { Option, program } from 'commander';
import $pkg from '../package.json' with { type: 'json' };
import * as config from './config.js';
import * as db from './database.js';
import { err, exit } from './utils.js';

program.version($pkg.version).name('axium').description('Axium server CLI');

// Options shared by multiple commands
const opts = {
	verbose: new Option('-v, --verbose', 'verbose output').default(false),

	// database
	host: new Option('-H, --host <host>', 'the host of the database.').default('localhost:5432'),
	timeout: new Option('-t, --timeout <ms>', 'how long to wait for commands to complete.').default(1000),
	force: new Option('-f, --force', 'force the operation').default(false),

	// config
	global: new Option('-g, --global', 'Apply to global config').default(false),
};

interface CommonOptions {
	verbose: boolean;
}

interface ConfigOptions {
	global: boolean;
}

interface Options {
	'db init': {
		host: string;
		timeout: number;
		force: boolean;
		skip: boolean;
	};

	'db status': {
		host: string;
	};

	'db drop': {
		host: string;
		force: boolean;
		timeout: number;
	};

	status: {
		dbHost: string;
	};

	enable: ConfigOptions;
	disable: ConfigOptions;
}

type Opt<T extends keyof Options> = Options[T] & CommonOptions;

const axiumDB = program.command('db').alias('database').description('manage the database');

function db_output(state: db.OpOutputState, message?: string) {
	switch (state) {
		case 'start':
			process.stdout.write(message + '...');
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
	.addOption(opts.host)
	.addOption(opts.timeout)
	.addOption(opts.force)
	.addOption(opts.verbose)
	.option('-s, --skip', 'Skip existing database and/or user')
	.action(async (opt: Opt<'db init'>) => {
		opt.verbose && opt.force && console.log(chalk.yellow('--force: Protections disabled.'));

		await db.init({ ...opt, output: db_output }).catch((e: number | string | Error) => {
			if (typeof e == 'number') process.exit(e);
			else exit(e);
		});
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('check the status of the database')
	.addOption(opts.host)
	.addOption(opts.verbose)
	.action(async (opt: Opt<'db status'>) =>
		db
			.statusText(opt)
			.then(console.log)
			.catch(() => exit('Unavailable'))
	);

axiumDB
	.command('drop')
	.description('drop the database')
	.addOption(opts.host)
	.addOption(opts.verbose)
	.addOption(opts.force)
	.addOption(opts.timeout)
	.action(async (opt: Opt<'db drop'>) => {
		opt.verbose && opt.force && console.log(chalk.yellow('--force: Protections disabled.'));

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

program
	.command('enable')
	.description('enable an authentication provider')
	.addOption(opts.verbose)
	.argument('<provider>', 'the provider to enable')
	.action((provider: string, opt: Opt<'enable'>) => {
		switch (provider) {
			case 'credentials':
				config.set({ credentials: true });
				break;
			case 'passkeys':
				config.set({ passkeys: true });
				break;
			default:
				exit(`Invalid provider: ${provider}`);
		}
	});

program
	.command('disable')
	.description('disable an authentication provider')
	.addOption(opts.verbose)
	.argument('<provider>', 'the provider to disable')
	.action((provider: string, opt: Opt<'disable'>) => {
		switch (provider) {
			case 'credentials':
				config.set({ credentials: false });
				break;
			case 'passkeys':
				config.set({ passkeys: false });
				break;
			default:
				exit(`Invalid provider: ${provider}`);
		}
	});

program
	.command('status')
	.alias('stats')
	.description('get information about the server')
	.option('-D --db-host <host>', 'the host of the database.', 'localhost:5432')
	.action(async (opt: Opt<'status'>) => {
		console.log('Axium Server v' + program.version());

		process.stdout.write('Database: ');
		await db
			.statusText({ host: opt.dbHost })
			.then(console.log)
			.catch(() => err('Unavailable'));
	});

program.parse();
