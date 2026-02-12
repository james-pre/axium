import type { AsyncResult } from '@axium/core/api';
import { authRequestForItem, checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import {} from './common.js';
import type schema from '../db.json';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}
