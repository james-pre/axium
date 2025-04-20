import type { AdapterAccountType as db } from '@auth/core/adapters';
import { Kysely, PostgresDialect, sql, type GeneratedAlways } from 'kysely';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { Preferences } from './auth.js';
import config from './config.js';
import { _fixOutput, run, someWarnings, type MaybeOutput, type WithOutput } from './io.js';
import { plugins } from './plugins.js';

export interface Schema {
	User: {
		id: GeneratedAlways<string>;
		name: string | null;
		email: string;
		emailVerified: Date | null;
		image: string | null;
		password: string | null;
		salt: string | null;
		preferences: Preferences;
	};
	Account: {
		id: GeneratedAlways<string>;
		userId: string;
		type: db;
		provider: string;
		providerAccountId: string;
		refresh_token?: string;
		access_token?: string;
		expires_at?: number;
		token_type?: Lowercase<string>;
		scope?: string;
		id_token?: string;
		session_state: string | null;
	};
	Session: {
		id: GeneratedAlways<string>;
		userId: string;
		sessionToken: string;
		expires: Date;
	};
	VerificationToken: {
		identifier: string;
		token: string;
		expires: Date;
	};
	Authenticator: {
		credentialID: string;
		userId: string;
		providerAccountId: string;
		credentialPublicKey: string;
		counter: number;
		credentialDeviceType: string;
		credentialBackedUp: boolean;
		transports: string | null;
	};
}

export let database: Kysely<Schema> & AsyncDisposable;

export function connect(): Kysely<Schema> & AsyncDisposable {
	if (database) return database;

	const _db = new Kysely<Schema>({
		dialect: new PostgresDialect({ pool: new pg.Pool(config.db) }),
	});

	database = Object.assign(_db, {
		async [Symbol.asyncDispose]() {
			await _db.destroy();
		},
	});

	return database;
}

export interface Stats {
	users: number;
	accounts: number;
	sessions: number;
}

export async function count(table: keyof Schema): Promise<number> {
	const db = connect();
	return (await db.selectFrom(table).select(db.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count;
}

export async function status(): Promise<Stats> {
	return {
		users: await count('User'),
		accounts: await count('Account'),
		sessions: await count('Session'),
	};
}

export async function statusText(): Promise<string> {
	try {
		const stats = await status();
		return `${stats.users} users, ${stats.accounts} accounts, ${stats.sessions} sessions`;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

export interface OpOptions extends MaybeOutput {
	timeout: number;
	force: boolean;
}

export interface InitOptions extends OpOptions {
	skip: boolean;
}

export function shouldRecreate(opt: InitOptions & WithOutput): boolean {
	if (opt.skip) {
		opt.output('warn', 'already exists. (skipped)');
		return true;
	}

	if (opt.force) {
		opt.output('warn', 'already exists. (re-creating)');
		return false;
	}

	opt.output('warn', 'already exists. Use --skip to skip or --force to re-create.');
	throw 2;
}

export async function init(opt: InitOptions): Promise<void> {
	_fixOutput(opt);
	if (!config.db.password) {
		config.save({ db: { password: randomBytes(32).toString('base64') } }, true);
		opt.output('debug', 'Generated password and wrote to global config');
	}

	const _sql = (command: string, message: string) => run(opt, message, `sudo -u postgres psql -c "${command}"`);
	const warnExists = someWarnings(opt.output, [/(schema|relation) "\w+" already exists/, 'already exists.']);
	const done = () => opt.output('done');

	await _sql('CREATE DATABASE axium', 'Creating database').catch(async (error: string) => {
		if (error != 'database "axium" already exists') throw error;
		if (shouldRecreate(opt)) return;

		await _sql('DROP DATABASE axium', 'Dropping database');
		await _sql('CREATE DATABASE axium', 'Re-creating database');
	});

	const createQuery = `CREATE USER axium WITH ENCRYPTED PASSWORD '${config.db.password}' LOGIN`;
	await _sql(createQuery, 'Creating user').catch(async (error: string) => {
		if (error != 'role "axium" already exists') throw error;
		if (shouldRecreate(opt)) return;

		await _sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
		await _sql('DROP USER axium', 'Dropping user');
		await _sql(createQuery, 'Re-creating user');
	});

	await _sql('GRANT ALL PRIVILEGES ON DATABASE axium TO axium', 'Granting database privileges');
	await _sql('GRANT ALL PRIVILEGES ON SCHEMA public TO axium', 'Granting schema privileges');
	await _sql('ALTER DATABASE axium OWNER TO axium', 'Setting database owner');

	await _sql('SELECT pg_reload_conf()', 'Reloading configuration');

	await using db = connect();

	opt.output('start', 'Creating table User');
	await db.schema
		.createTable('User')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('name', 'text')
		.addColumn('email', 'text', col => col.unique().notNull())
		.addColumn('emailVerified', 'timestamptz')
		.addColumn('image', 'text')
		.addColumn('password', 'text')
		.addColumn('salt', 'text')
		.addColumn('preferences', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating table Account');
	await db.schema
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
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating index for Account.userId');
	await db.schema.createIndex('Account_userId_index').on('Account').column('userId').execute().then(done).catch(warnExists);

	opt.output('start', 'Creating table Session');
	await db.schema
		.createTable('Session')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('sessionToken', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating index for Session.userId');
	await db.schema.createIndex('Session_userId_index').on('Session').column('userId').execute().then(done).catch(warnExists);

	opt.output('start', 'Creating table VerificationToken');
	await db.schema
		.createTable('VerificationToken')
		.addColumn('identifier', 'text', col => col.notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating table Authenticator');
	await db.schema
		.createTable('Authenticator')
		.addColumn('credentialID', 'text', col => col.primaryKey().notNull())
		.addColumn('userId', 'uuid', col => col.notNull().references('User.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('providerAccountId', 'text', col => col.notNull())
		.addColumn('credentialPublicKey', 'text', col => col.notNull())
		.addColumn('counter', 'integer', col => col.notNull())
		.addColumn('credentialDeviceType', 'text', col => col.notNull())
		.addColumn('credentialBackedUp', 'boolean', col => col.notNull())
		.addColumn('transports', 'text')
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating index for Authenticator.credentialID');
	await db.schema.createIndex('Authenticator_credentialID_key').on('Authenticator').column('credentialID').execute().then(done).catch(warnExists);

	for (const plugin of plugins) {
		if (!plugin.db) continue;
		opt.output('plugin', plugin.name);
		await plugin.db.init(opt, db, { warnExists, done });
	}
}

/**
 * Completely remove Axium from the database.
 */
export async function uninstall(opt: OpOptions): Promise<void> {
	_fixOutput(opt);

	const db = connect();

	for (const plugin of plugins) {
		if (!plugin.db) continue;
		opt.output('plugin', plugin.name);
		await plugin.db.remove(opt, db);
	}

	await db.destroy();

	const _sql = (command: string, message: string) => run(opt, message, `sudo -u postgres psql -c "${command}"`);
	await _sql('DROP DATABASE axium', 'Dropping database');
	await _sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
	await _sql('DROP USER axium', 'Dropping user');
}

/**
 * Removes all data from tables.
 */
export async function wipe(opt: OpOptions): Promise<void> {
	_fixOutput(opt);

	const db = connect();

	for (const plugin of plugins) {
		if (!plugin.db) continue;
		opt.output('plugin', plugin.name);
		await plugin.db.wipe(opt, db);
	}

	for (const table of ['User', 'Account', 'Session', 'VerificationToken', 'Authenticator'] as const) {
		opt.output('start', `Removing data from ${table}`);
		await db.deleteFrom(table).execute();
		opt.output('done');
	}
}
