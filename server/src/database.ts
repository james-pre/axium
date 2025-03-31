import type { AdapterAccountType } from '@auth/core/adapters';
import { Kysely, PostgresDialect, type GeneratedAlways } from 'kysely';
import pg from 'pg';

export interface Schema {
	User: {
		id: GeneratedAlways<string>;
		name: string | null;
		email: string;
		emailVerified: Date | null;
		image: string | null;
	};
	Account: {
		id: GeneratedAlways<string>;
		userId: string;
		type: AdapterAccountType;
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

export interface Config {
	password?: string;
	host?: string;
	port?: number;
}

export function normalizeConfig(config: Config): Config {
	config.host ??= 'localhost';

	if (!config.port) {
		const [hostname, port] = config.host.split(':');
		config.port = port ? parseInt(port) : 5432;
		config.host = hostname;
	}

	if (config.host.includes(':')) config.host = config.host.split(':')[0];

	return config;
}

export let database: Kysely<Schema> & AsyncDisposable;

export function connect(config: Config): Kysely<Schema> & AsyncDisposable {
	if (database) return database;

	normalizeConfig(config);

	const _db = new Kysely<Schema>({
		dialect: new PostgresDialect({
			pool: new pg.Pool({
				...config,
				user: 'axium',
				database: 'axium',
			}),
		}),
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

export async function status(config: Config): Promise<Stats> {
	normalizeConfig(config);

	await using db = connect(config);

	return {
		users: (await db.selectFrom('User').select(db.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count,
		accounts: (await db.selectFrom('Account').select(db.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count,
		sessions: (await db.selectFrom('Session').select(db.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count,
	};
}

export async function statusText(config: Config): Promise<string> {
	try {
		const stats = await status(config);
		return `${stats.users} users, ${stats.accounts} accounts, ${stats.sessions} sessions`;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}
