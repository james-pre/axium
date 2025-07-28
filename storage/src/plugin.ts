import { formatBytes } from '@axium/core/format';
import * as acl from '@axium/server/acl';
import config from '@axium/server/config';
import type { InitOptions, OpOptions } from '@axium/server/database';
import { count, createIndex, database, warnExists } from '@axium/server/database';
import { done, start } from '@axium/server/io';
import type { Plugin } from '@axium/server/plugins';
import { sql } from 'kysely';
import pkg from '../package.json' with { type: 'json' };
import './common.js';
import './server.js';

async function statusText(): Promise<string> {
	const { storage: items } = await count('storage');
	const { size } = await database
		.selectFrom('storage')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return `${items} items totaling ${formatBytes(Number(size))}`;
}

async function db_init(opt: InitOptions) {
	start('Creating table storage');
	await database.schema
		.createTable('storage')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
		.addColumn('parentId', 'uuid', col => col.references('storage.id').onDelete('cascade').defaultTo(null))
		.addColumn('createdAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('modifiedAt', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('size', 'integer', col => col.notNull())
		.addColumn('trashedAt', 'timestamptz', col => col.defaultTo(null))
		.addColumn('hash', 'bytea', col => col.notNull())
		.addColumn('name', 'text', col => col.defaultTo(null))
		.addColumn('type', 'text', col => col.notNull())
		.addColumn('immutable', 'boolean', col => col.notNull())
		.addColumn('publicPermission', 'integer', col => col.notNull().defaultTo(0))
		.addColumn('metadata', 'jsonb', col => col.notNull().defaultTo('{}'))
		.execute()
		.then(done)
		.catch(warnExists);

	await createIndex('storage', 'userId');
	await createIndex('storage', 'parentId');
	await acl.createTable('storage');
}

async function db_wipe(opt: OpOptions) {
	start('Removing data from user storage');
	await database.deleteFrom('storage').execute();
	await acl.wipeTable('storage');
	done();
}

async function remove(opt: OpOptions) {
	start('Dropping table storage');
	await database.schema.dropTable('storage').execute();
	await acl.dropTable('storage');
	done();
}

async function clean(opt: OpOptions) {
	start('Removing expired trash items');

	const nDaysAgo = new Date(Date.now() - 86400000 * config.storage.trash_duration);
	await database
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
