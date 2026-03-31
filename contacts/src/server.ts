import { database } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import type schema from '../db.json';
import {} from './common.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}
