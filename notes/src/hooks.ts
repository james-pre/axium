import { done, start } from '@axium/core/node/io';
import * as acl from '@axium/server/acl';
import { count, createIndex, database, warnExists } from '@axium/server/database';
import { sql } from 'kysely';
import './common.js';
import './server.js';

export async function statusText(): Promise<string> {
	const { notes } = await count('notes');

	return `${notes} notes`;
}

export async function db_init(): Promise<void> {
	start('Creating table notes');
	await database.schema
		.createTable('notes')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
		.addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('modified', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('publicPermission', 'integer', col => col.notNull().defaultTo(0))
		.addColumn('title', 'text', col => col.notNull())
		.addColumn('content', 'text')
		.addColumn('labels', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
		.execute()
		.then(done)
		.catch(warnExists);

	await createIndex('notes', 'userId');
	await acl.createTable('notes');
}

export async function db_wipe(): Promise<void> {
	start('Wiping data from notes');
	await database.deleteFrom('notes').execute().then(done);

	await acl.wipeTable('notes');
}

export async function remove() {
	await acl.dropTable('notes');

	start('Dropping table notes');
	await database.schema.dropTable('notes').execute().then(done);
}
