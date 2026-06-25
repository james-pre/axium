import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import type schema from '../../db.json';
import './socket.js';
import type {} from '@axium/server/database';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}
