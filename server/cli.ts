#!/usr/bin/env node
import chalk from 'chalk';
import { Option, program } from 'commander';
import { sql } from 'kysely';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as _db from './database.js';

program.version('0.0.0').name('axium').description('Axium server CLI');

// Options shared by multiple commands
const opts = {
	host: new Option('-H, --host <host>', 'the host of the database.').default('localhost:5432'),
	timeout: new Option('-t, --timeout <ms>', 'how long to wait for commands to complete.').default(1000),
	force: new Option('-f, --force', 'force the operation').default(false),
	verbose: new Option('-v, --verbose', 'verbose output').default(false),
};

interface Opts {
	'db init': {
		host: string;
		timeout: number;
		force: boolean;
		verbose: boolean;
		skip: boolean;
	};

	'db status': {
		host: string;
		verbose: boolean;
	};

	'db drop': {
		host: string;
		verbose: boolean;
		force: boolean;
		timeout: number;
	};

	status: {
		dbHost: string;
	};
}

const axiumDB = program.command('db').alias('database').description('manage the database');

interface RunOptions {
	timeout?: number;
}

/** Convenience function for `example... [Done. / error]` */
async function report<T>(promise: Promise<T>, message: string, success: string = 'done.'): Promise<T> {
	process.stdout.write(message + '... ');

	try {
		const result = await promise;
		console.log(success);
		return result;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

/** Convenience function for `sudo -u postgres psql -c "${command}"`, plus `report` coolness */
async function runSQL(opts: RunOptions, command: string, message: string) {
	let stderr: string | undefined;

	try {
		process.stdout.write(message + '... ');
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		exec(`sudo -u postgres psql -c "${command}"`, { timeout: 1000, ...opts }, (err, _, _stderr) => {
			stderr = _stderr.startsWith('ERROR:') ? _stderr.slice(6).trim() : _stderr;
			if (err) reject('[command]');
			else resolve();
		});
		await promise;
		console.log('done.');
	} catch (error: any) {
		throw error == '[command]' ? stderr?.slice(0, 100) || 'failed.' : typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

function err(message: string | Error): void {
	if (message instanceof Error) message = message.message;
	console.error(message.startsWith('\x1b') ? message : chalk.red(message));
}

/** Yet another convenience function */
function exit(message: string | Error, code: number = 1): never {
	err(message);
	process.exit(code);
}

function shouldRecreate(opt: { force: boolean; skip: boolean }): boolean {
	if (opt.skip) {
		console.warn(chalk.yellow('already exists. (skipped)'));
		return true;
	}

	if (opt.force) {
		console.warn(chalk.yellow('already exists. (re-creating)'));
		return false;
	}

	console.warn(chalk.yellow('already exists. Use --skip to skip or --force to re-create.'));
	process.exit(2);
}

axiumDB
	.command('init')
	.description('initialize the database')
	.addOption(opts.host)
	.addOption(opts.timeout)
	.addOption(opts.force)
	.addOption(opts.verbose)
	.option('-s, --skip', 'Skip existing database and/or user')
	.action(async (opt: Opts['db init']) => {
		opt.verbose && opt.force && console.log(chalk.yellow('--force: Protections disabled.'));

		const config = _db.normalizeConfig(opt);
		config.password ??= process.env.PGPASSWORD || randomBytes(32).toString('base64').replaceAll('=', '').replaceAll('/', '_').replaceAll('+', '-');

		await runSQL(opt, 'CREATE DATABASE axium', 'Creating database')
			.catch(async error => {
				if (error != 'database "axium" already exists') exit(error);
				if (shouldRecreate(opt)) return;

				await runSQL(opt, 'DROP DATABASE axium', 'Dropping database');
				await runSQL(opt, 'CREATE DATABASE axium', 'Re-creating database');
			})
			.catch(exit);

		const createQuery = `CREATE USER axium WITH ENCRYPTED PASSWORD '${config.password}' LOGIN`;
		await runSQL(opt, createQuery, 'Creating user')
			.catch(async error => {
				if (error != 'role "axium" already exists') exit(error);
				if (shouldRecreate(opt)) return;

				await runSQL(opt, 'REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
				await runSQL(opt, 'DROP USER axium', 'Dropping user');
				await runSQL(opt, createQuery, 'Re-creating user');
			})
			.catch(exit);

		await runSQL(opt, 'GRANT ALL PRIVILEGES ON DATABASE axium TO axium', 'Granting database privileges').catch(exit);
		await runSQL(opt, 'GRANT ALL PRIVILEGES ON SCHEMA public TO axium', 'Granting schema privileges').catch(exit);
		await runSQL(opt, 'ALTER DATABASE axium OWNER TO axium', 'Setting database owner').catch(exit);

		await runSQL(opt, 'SELECT pg_reload_conf()', 'Reloading configuration').catch(exit);

		await using db = _db.connect(config);

		const relationExists = (table: string) => (error: any) => (error == `relation "${table}" already exists` ? console.warn(chalk.yellow('already exists.')) : exit(error));
		const created = chalk.green('created.');

		await report(
			db.schema
				.createTable('User')
				.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
				.addColumn('name', 'text')
				.addColumn('email', 'text', col => col.unique().notNull())
				.addColumn('emailVerified', 'timestamptz')
				.addColumn('image', 'text')
				.execute(),
			'Creating table User',
			created
		).catch(relationExists('User'));

		await report(
			db.schema
				.createTable('Account')
				.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
				.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
				.addColumn('type', 'text', col => col.notNull())
				.addColumn('provider', 'text', col => col.notNull())
				.addColumn('providerAccountId', 'text', col => col.notNull())
				.addColumn('refresh_token', 'text')
				.addColumn('access_token', 'text')
				.addColumn('expires_at', 'bigint')
				.addColumn('token_type', 'text')
				.addColumn('scope', 'text')
				.addColumn('id_token', 'text')
				.addColumn('session_state', 'text')
				.execute(),
			'Creating table Account',
			created
		).catch(relationExists('Account'));

		await report(db.schema.createIndex('Account_userId_index').on('Account').column('userId').execute(), 'Creating index for Account.userId', created).catch(
			relationExists('Account_userId_index')
		);

		await report(
			db.schema
				.createTable('Session')
				.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
				.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
				.addColumn('sessionToken', 'text', col => col.notNull().unique())
				.addColumn('expires', 'timestamptz', col => col.notNull())
				.execute(),
			'Creating table Session',
			created
		).catch(relationExists('Session'));

		await report(db.schema.createIndex('Session_userId_index').on('Session').column('userId').execute(), 'Creating index for Session.userId', created).catch(
			relationExists('Session_userId_index')
		);

		await report(
			db.schema
				.createTable('VerificationToken')
				.addColumn('identifier', 'text', col => col.notNull())
				.addColumn('token', 'text', col => col.notNull().unique())
				.addColumn('expires', 'timestamptz', col => col.notNull())
				.execute(),
			'Creating table VerificationToken',
			created
		).catch(relationExists('VerificationToken'));

		await report(
			db.schema
				.createTable('Authenticator')
				.addColumn('credentialID', 'text', col => col.primaryKey().notNull())
				.addColumn('userId', 'uuid', col => col.notNull().references('User.id').onDelete('cascade').onUpdate('cascade'))
				.addColumn('providerAccountId', 'text', col => col.notNull())
				.addColumn('credentialPublicKey', 'text', col => col.notNull())
				.addColumn('counter', 'integer', col => col.notNull())
				.addColumn('credentialDeviceType', 'text', col => col.notNull())
				.addColumn('credentialBackedUp', 'boolean', col => col.notNull())
				.addColumn('transports', 'text')
				.execute(),
			'Creating table Authenticator',
			created
		).catch(relationExists('Authenticator'));

		await report(
			db.schema.createIndex('Authenticator_credentialID_key').on('Authenticator').column('credentialID').execute(),
			'Creating index for Authenticator.credentialID',
			created
		).catch(relationExists('Authenticator_credentialID_key'));

		console.log('Done!\nPassword: ' + config.password);
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('check the status of the database')
	.addOption(opts.host)
	.addOption(opts.verbose)
	.action(async (opt: Opts['db status']) =>
		_db
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
	.action(async (opt: Opts['db drop']) => {
		opt.verbose && opt.force && console.log(chalk.yellow('--force: Protections disabled.'));

		_db.normalizeConfig(opt);

		const stats = await _db.status(opt).catch(exit);

		if (!opt.force)
			for (const key of ['users', 'accounts', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				console.warn(chalk.yellow(`Database has existing ${key}. Use --force if you really want to drop the database.`));
				process.exit(2);
			}

		await runSQL(opt, 'DROP DATABASE axium', 'Dropping database').catch(exit);
		await runSQL(opt, 'REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges').catch(exit);
		await runSQL(opt, 'DROP USER axium', 'Dropping user').catch(exit);
	});

program
	.command('status')
	.alias('stats')
	.description('get information about the server')
	.option('-D --db-host <host>', 'the host of the database.', 'localhost:5432')
	.action(async (opt: Opts['status']) => {
		console.log('Axium Server v' + program.version());

		process.stdout.write('Database: ');
		await _db
			.statusText({ host: opt.dbHost })
			.then(console.log)
			.catch(() => err('Unavailable'));
	});

program.parse();
