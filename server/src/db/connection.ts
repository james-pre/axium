import * as io from '@axium/core/node/io';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import config from '../config.js';
import type { Schema } from '../database.js';

export type Database = Kysely<Schema> & AsyncDisposable;

const sym = Symbol.for('Axium:database');

declare const globalThis: {
	[sym]?: Database;
};

export let database: Database;

export function connect(): Database {
	if (database) return database;
	if (globalThis[sym]) return (database = globalThis[sym]);

	database = new Kysely<Schema>({
		dialect: new PostgresDialect({ pool: new pg.Pool(config.db) }),
	});

	globalThis[sym] = database;
	io.debug('Connected to database!');
	return database;
}
