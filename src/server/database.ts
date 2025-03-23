import type { Database as KyselyDatabase } from '@auth/kysely-adapter';
import { KyselyAuth } from '@auth/kysely-adapter';
import { PostgresDialect, sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export interface Schema extends KyselyDatabase {
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

export function normalizeConfig(config: Config): Config {
	if (!config.port) {
		const [hostname, port] = config.host.split(':');
		config.port = port ? parseInt(port) : 5432;
		config.host = hostname;
	}

	if (config.host.includes(':')) config.host = config.host.split(':')[0];

	return config;
}

export let database: KyselyAuth<Schema>;

export interface Config {
	password?: string;
	host: string;
	port?: number;
}

export function connect(config: Config): KyselyAuth<Schema> {
	if (database) return database;

	normalizeConfig(config);

	database = new KyselyAuth<Schema>({
		dialect: new PostgresDialect({
			pool: new pg.Pool({
				...config,
				user: 'bedrock',
				database: 'bedrock',
			}),
		}),
	});

	return database;
}

/**
 * @param host The host of the database, e.g. localhost:5432
 */
export async function setup(host: string): Promise<Config> {
	const config = normalizeConfig({ host });

	const client = new pg.Client({
		...config,
		user: 'postgres',
		database: 'postgres',
	});

	await client.connect();

	config.password = randomBytes(32).toString('base64');

	await client.query('CREATE DATABASE bedrock;');
	await client.query(`CREATE USER bedrock WITH ENCRYPTED PASSWORD '${config.password}';`);
	await client.query('GRANT ALL PRIVILEGES ON DATABASE bedrock TO bedrock;');

	await client.end();

	const db = connect(config);

	await db.schema
		.createTable('User')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('name', 'text')
		.addColumn('email', 'text', col => col.unique().notNull())
		.addColumn('emailVerified', 'timestamptz')
		.addColumn('image', 'text')
		.execute();

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
		.execute();

	await db.schema
		.createTable('Session')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('sessionToken', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute();

	await db.schema
		.createTable('VerificationToken')
		.addColumn('identifier', 'text', col => col.notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute();

	await db.schema.createIndex('Account_userId_index').on('Account').column('userId').execute();

	await db.schema.createIndex('Session_userId_index').on('Session').column('userId').execute();

	await db.schema
		.createTable('Authenticator')
		.addColumn('credentialID', 'text', col => col.primaryKey().notNull())
		.addColumn('userId', 'text', col => col.primaryKey().notNull().references('User.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('providerAccountId', 'text', col => col.notNull())
		.addColumn('credentialPublicKey', 'text', col => col.notNull())
		.addColumn('counter', 'integer', col => col.notNull())
		.addColumn('credentialDeviceType', 'text', col => col.notNull())
		.addColumn('credentialBackedUp', 'boolean', col => col.notNull())
		.addColumn('transports', 'text')
		.execute();

	await db.schema.createIndex('Authenticator_credentialID_key').on('Authenticator').column('credentialID').execute();

	return config;
}

export async function wipe(host: string) {
	const client = new pg.Client({
		...normalizeConfig({ host }),
		user: 'postgres',
		database: 'postgres',
	});

	await client.connect();

	await client.query('DROP DATABASE bedrock;');
	await client.query('DROP USER bedrock;');

	await client.end();
}
