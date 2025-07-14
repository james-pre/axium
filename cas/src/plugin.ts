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
	const items = await count('cas');
	const { size } = await database
		.selectFrom('cas')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return `${items} items totaling ${formatBytes(Number(size))}`;
}

async function db_init(opt: InitOptions, db: Database) {
	start('Creating table cas');
	await db.schema
		.createTable('cas')
		.addColumn('itemId', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('ownerId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('lastModified', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('restricted', 'boolean', col => col.notNull().defaultTo(false))
		.addColumn('size', 'integer', col => col.notNull())
		.addColumn('trashedAt', 'timestamptz', col => col.defaultTo(null))
		.addColumn('hash', 'bytea', col => col.notNull())
		.addColumn('name', 'text', col => col.defaultTo(null))
		.addColumn('type', 'text', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);
}

async function db_wipe(opt: OpOptions, db: Database) {
	start('Removing data from cas');
	await db.deleteFrom('cas').execute();
	done();
}

async function remove(opt: OpOptions, db: Database) {
	start('Dropping table cas');
	await db.schema.dropTable('cas').execute();
	done();
}

async function clean(opt: OpOptions, db: Database) {
	const { trash_duration } = config.cas;

	start(`Removing trashed CAS items older than ${trash_duration} days`);

	const nDaysAgo = new Date(Date.now() - 86400000 * trash_duration);
	await db.deleteFrom('cas').where('trashedAt', 'is not', null).where('trashedAt', '<', nDaysAgo).executeTakeFirstOrThrow().then(done);
}

export default {
	...pkg,
	statusText,
	hooks: { db_init, db_wipe, remove, clean },
} satisfies Plugin;
