import type { Adapter, AdapterAccount, AdapterAuthenticator } from '@auth/core/adapters';
import { CredentialsSignin } from '@auth/core/errors';
import type { Provider } from '@auth/core/providers';
import Credentials from '@auth/core/providers/credentials';
import Passkey from '@auth/core/providers/passkey';
import type { AuthConfig } from '@auth/core/types';
import { KyselyAdapter, type Database, type KyselyAuth } from '@auth/kysely-adapter';
import { Login, Registration } from '@axium/core/api';
import { genSaltSync, hashSync } from 'bcryptjs';
import { omit } from 'utilium';
import * as config from './config.js';
import * as db from './database.js';
import { randomBytes } from 'node:crypto';

declare module '@auth/core/adapters' {
	interface AdapterUser {
		password: string;
		salt: string;
	}
}

export let adapter: Adapter;

export function createAdapter(): Adapter {
	const conn = db.connect(config.db);

	adapter = Object.assign(KyselyAdapter(conn as any as KyselyAuth<Database>), {
		_axium: { config },
		async getAccount(providerAccountId: AdapterAccount['providerAccountId'], provider: AdapterAccount['provider']): Promise<AdapterAccount | null> {
			const result = await conn.selectFrom('Account').selectAll().where('providerAccountId', '=', providerAccountId).where('provider', '=', provider).executeTakeFirst();
			return result ?? null;
		},
		async getAuthenticator(credentialID: AdapterAuthenticator['credentialID']): Promise<AdapterAuthenticator | null> {
			const result = await conn.selectFrom('Authenticator').selectAll().where('credentialID', '=', credentialID).executeTakeFirst();
			return result ?? null;
		},
		async createAuthenticator(authenticator: AdapterAuthenticator): Promise<AdapterAuthenticator> {
			await conn.insertInto('Authenticator').values(authenticator).executeTakeFirstOrThrow();
			return authenticator;
		},
		async listAuthenticatorsByUserId(userId: AdapterAuthenticator['userId']): Promise<AdapterAuthenticator[]> {
			const result = await conn.selectFrom('Authenticator').selectAll().where('userId', '=', userId).execute();
			return result;
		},
		async updateAuthenticatorCounter(credentialID: AdapterAuthenticator['credentialID'], newCounter: AdapterAuthenticator['counter']): Promise<AdapterAuthenticator> {
			await conn.updateTable('Authenticator').set({ counter: newCounter }).where('credentialID', '=', credentialID).executeTakeFirstOrThrow();
			const authenticator = await this.getAuthenticator(credentialID);
			if (!authenticator) throw new Error('Authenticator not found');
			return authenticator;
		},
	});

	return adapter;
}

export async function register(credentials: Registration) {
	const { email, password, name } = Registration.parse(credentials);

	const existing = await adapter.getUserByEmail?.(email);
	if (existing) throw 'User already exists';

	let id = crypto.randomUUID();
	while (await adapter.getUser?.(id)) id = crypto.randomUUID();

	const salt = genSaltSync(10);

	const user = await adapter.createUser?.({
		id,
		name,
		email,
		emailVerified: null,
		salt,
		password: hashSync(password, salt),
	});

	const expires = new Date();
	expires.setMonth(expires.getMonth() + 1);

	const session = await adapter.createSession?.({
		sessionToken: randomBytes(64).toString('base64'),
		userId: id,
		expires,
	});

	return { user, session };
}

export async function authorize(credentials: Partial<Record<string, unknown>>) {
	const { success, error, data } = Login.safeParse(credentials);
	if (!success) throw new CredentialsSignin(error);

	const user = await adapter.getUserByEmail?.(data.email);
	if (!user) return null;

	if (user.password !== hashSync(data.password, user.salt)) return null;

	return omit(user, 'password', 'salt');
}

/**
 * Get the providers current enabled in the Axium config.
 */
export function getProviders(): Provider[] {
	const providers: Provider[] = [];

	if (config.passkeys) providers.push(Passkey);
	if (config.credentials) {
		providers.push(
			Credentials({
				credentials: {
					email: { label: 'Email', type: 'email' },
					password: { label: 'Password', type: 'password' },
				},
				authorize,
			})
		);
	}

	return providers;
}

export function getConfig(): AuthConfig {
	createAdapter();

	return {
		adapter,
		providers: getProviders(),
		debug: config.debug,
		experimental: { enableWebAuthn: true },
	};
}
