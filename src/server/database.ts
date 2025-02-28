import type { Database as KyselyDatabase } from '@auth/kysely-adapter';
import { KyselyAuth } from '@auth/kysely-adapter';
import SQLite from 'better-sqlite3';
import { SqliteDialect } from 'kysely';

export interface Database extends KyselyDatabase {
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

export const db = new KyselyAuth<Database>({
	dialect: new SqliteDialect({
		database: new SQLite(':memory:'),
	}),
});
