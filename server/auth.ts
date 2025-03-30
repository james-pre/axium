import type { Adapter, AdapterAccount, AdapterAuthenticator } from '@auth/core/adapters';
import { KyselyAdapter, type Database, type KyselyAuth } from '@auth/kysely-adapter';
import { connect, type Config } from './database.js';

export function adapter(config: Config): Adapter {
	const db = connect(config);

	return Object.assign(KyselyAdapter(db as any as KyselyAuth<Database>), {
		async getAccount(providerAccountId: AdapterAccount['providerAccountId'], provider: AdapterAccount['provider']): Promise<AdapterAccount | null> {
			const result = await db.selectFrom('Account').selectAll().where('providerAccountId', '=', providerAccountId).where('provider', '=', provider).executeTakeFirst();

			return result ?? null;
		},
		async getAuthenticator(credentialID: AdapterAuthenticator['credentialID']): Promise<AdapterAuthenticator | null> {
			const result = await db.selectFrom('Authenticator').selectAll().where('credentialID', '=', credentialID).executeTakeFirst();

			return result ?? null;
		},
		async createAuthenticator(authenticator: AdapterAuthenticator): Promise<AdapterAuthenticator> {
			await db.insertInto('Authenticator').values(authenticator).executeTakeFirstOrThrow();

			return authenticator;
		},
		async listAuthenticatorsByUserId(userId: AdapterAuthenticator['userId']): Promise<AdapterAuthenticator[]> {
			const result = await db.selectFrom('Authenticator').selectAll().where('userId', '=', userId).execute();

			return result;
		},
		async updateAuthenticatorCounter(credentialID: AdapterAuthenticator['credentialID'], newCounter: AdapterAuthenticator['counter']): Promise<AdapterAuthenticator> {
			await db.updateTable('Authenticator').set({ counter: newCounter }).where('credentialID', '=', credentialID).executeTakeFirstOrThrow();

			const authenticator = await this.getAuthenticator(credentialID);

			if (!authenticator) throw new Error('Authenticator not found');

			return authenticator;
		},
	});
}
