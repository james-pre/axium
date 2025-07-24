import config from '@axium/server/config';
import type { Database, InitOptions, OpOptions } from '@axium/server/database';
import { count, database, warnExists } from '@axium/server/database';
import { done, start } from '@axium/server/io';
import type { Plugin } from '@axium/server/plugins';
import { sql } from 'kysely';
import pkg from '../package.json' with { type: 'json' };
import './common.js';
import './server.js';
import { formatBytes } from '@axium/core/format';

async function statusText(): Promise<string> {
	const items = await count('storage');
	const { size } = await database
		.selectFrom('storage')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return `${items} items totaling ${formatBytes(Number(size))}`;
}

async function db_init(opt: InitOptions, db: Database) {
	start('Creating table storage');
	await db.schema
		.createTable('storage')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('parentId', 'uuid', col => col.references('storage.itemId').onDelete('cascade').onUpdate('cascade').defaultTo(null))
		.addColumn('createdAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('modifiedAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('restricted', 'boolean', col => col.notNull().defaultTo(false))
		.addColumn('size', 'integer', col => col.notNull())
		.addColumn('trashedAt', 'timestamptz', col => col.defaultTo(null))
		.addColumn('hash', 'bytea', col => col.notNull())
		.addColumn('name', 'text', col => col.defaultTo(null))
		.addColumn('type', 'text', col => col.notNull())
		.addColumn('immutable', 'boolean', col => col.notNull())
		.addColumn('visibility', 'integer', col => col.notNull().defaultTo(0))
		.execute()
		.then(done)
		.catch(warnExists);

	start('Creating index for storage.userId');
	await db.schema.createIndex('storage_userId_index').on('storage').column('userId').execute().then(done).catch(warnExists);

	start('Creating index for storage.parentId');
	await db.schema.createIndex('storage_parentId_index').on('storage').column('parentId').execute().then(done).catch(warnExists);
}

async function db_wipe(opt: OpOptions, db: Database) {
	start('Removing data from user storage');
	await db.deleteFrom('storage').execute();
	done();
}

async function remove(opt: OpOptions, db: Database) {
	start('Dropping table storage');
	await db.schema.dropTable('storage').execute();
	done();
}

async function clean(opt: OpOptions, db: Database) {
	start('Removing expired trash items');

	const nDaysAgo = new Date(Date.now() - 86400000 * config.storage.trash_duration);
	await db
		.deleteFrom('storage')
		.where('trashedAt', 'is not', null)
		.where('trashedAt', '<', nDaysAgo)
		.executeTakeFirstOrThrow()
		.then(done);
}

export default {
	...pkg,
	statusText,
	hooks: { db_init, db_wipe, remove, clean },
} satisfies Plugin;
