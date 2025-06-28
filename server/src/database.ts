import type { Preferences } from '@axium/core';
import { Kysely, PostgresDialect, sql, type GeneratedAlways } from 'kysely';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import config from './config.js';
import { _fixOutput, run, someWarnings, type MaybeOutput, type WithOutput } from './io.js';
import { plugins } from './plugins.js';
import type { VerificationRole } from './auth.js';

export interface Schema {
	users: {
		id: GeneratedAlways<string>;
		email: string;
		name: string;
		image?: string | null;
		emailVerified?: Date | null;
		password: string | null;
		salt: string | null;
		preferences?: Preferences;
	};
	sessions: {
		id: GeneratedAlways<string>;
		created: GeneratedAlways<Date>;
		userId: string;
		token: string;
		expires: Date;
	};
	verifications: {
		userId: string;
		token: string;
		expires: Date;
		role: VerificationRole;
	};
	passkeys: {
		id: string;
		name: string | null;
		createdAt: GeneratedAlways<Date>;
		userId: string;
		publicKey: Uint8Array;
		counter: number;
		deviceType: string;
		backedUp: boolean;
		transports: string | null;
	};
}

export interface Database extends Kysely<Schema>, AsyncDisposable {}

export let database: Database;

export function connect(): Database {
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
	passkeys: number;
	sessions: number;
}

export async function count(table: keyof Schema): Promise<number> {
	const db = connect();
	return (await db.selectFrom(table).select(db.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count;
}

export async function status(): Promise<Stats> {
	return {
		users: await count('users'),
		passkeys: await count('passkeys'),
		sessions: await count('sessions'),
	};
}

export async function statusText(): Promise<string> {
	try {
		const stats = await status();
		return `${stats.users} users, ${stats.passkeys} passkeys, ${stats.sessions} sessions`;
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

export interface PluginShortcuts {
	done: () => void;
	warnExists: (error: string | Error) => void;
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

	opt.output('start', 'Creating table users');
	await db.schema
		.createTable('users')
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

	opt.output('start', 'Creating table sessions');
	await db.schema
		.createTable('sessions')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('users.id').onDelete('cascade').notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('created', 'timestamptz', col => col.notNull())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating index for sessions.userId');
	await db.schema.createIndex('sessions_userId_index').on('sessions').column('userId').execute().then(done).catch(warnExists);

	opt.output('start', 'Creating table verifications');
	await db.schema
		.createTable('verifications')
		.addColumn('userId', 'uuid', col => col.references('users.id').onDelete('cascade').notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.addColumn('role', 'text', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating table passkeys');
	await db.schema
		.createTable('passkeys')
		.addColumn('id', 'text', col => col.primaryKey().notNull())
		.addColumn('name', 'text')
		.addColumn('createdAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('publicKey', 'bytea', col => col.notNull())
		.addColumn('counter', 'integer', col => col.notNull())
		.addColumn('deviceType', 'text', col => col.notNull())
		.addColumn('backedUp', 'boolean', col => col.notNull())
		.addColumn('transports', 'text')
		.execute()
		.then(done)
		.catch(warnExists);

	opt.output('start', 'Creating index for passkeys.id');
	await db.schema.createIndex('passkeys.id_key').on('passkeys').column('id').execute().then(done).catch(warnExists);

	for (const plugin of plugins) {
		if (!plugin.db_init) continue;
		opt.output('plugin', plugin.name);
		await plugin.db_init(opt, db, { warnExists, done } satisfies PluginShortcuts);
	}
}

/**
 * Completely remove Axium from the database.
 */
export async function uninstall(opt: OpOptions): Promise<void> {
	_fixOutput(opt);

	const db = connect();

	for (const plugin of plugins) {
		if (!plugin.db_remove) continue;
		opt.output('plugin', plugin.name);
		await plugin.db_remove(opt, db);
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
		if (!plugin.db_wipe) continue;
		opt.output('plugin', plugin.name);
		await plugin.db_wipe(opt, db);
	}

	for (const table of ['users', 'passkeys', 'sessions', 'verifications'] as const) {
		opt.output('start', `Removing data from ${table}`);
		await db.deleteFrom(table).execute();
		opt.output('done');
	}
}
