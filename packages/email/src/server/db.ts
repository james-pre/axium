import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { addObjectType as addSyncObjectType } from '@axium/server/sync';
import type { ColumnType, Generated } from 'kysely';
import type schema from '../../db.json';
import type { EmailFolder, Mailbox } from '../common.js';
import type {} from '@axium/server/database';

type _DB = FromSchemaFile<typeof schema>;

declare module '@axium/server/database' {
	export interface Schema extends Omit<_DB, 'emails'> {
		emails: Omit<_DB['emails'], 'from' | 'to' | 'cc' | 'bcc' | 'folder'> & {
			// jsonb columns are written as JSON strings (node-postgres treats plain arrays as Postgres arrays)
			from: ColumnType<Mailbox, string | Mailbox, string | Mailbox>;
			to: ColumnType<Mailbox[], string | Mailbox[], string | Mailbox[]>;
			cc: ColumnType<Mailbox[], string | Mailbox[], string | Mailbox[]>;
			bcc: ColumnType<Mailbox[], string | Mailbox[], string | Mailbox[]>;
			folder: Generated<EmailFolder>;
		};
	}
}

addSyncObjectType('emails');
