import type { Database, InitOptions, OpOptions, PluginShortcuts } from '@axium/server/database';
import { count, database } from '@axium/server/database';
import type { WithOutput } from '@axium/server/io';
import { sql } from 'kysely';
import pkg from '../package.json' with { type: 'json' };

export const id = pkg.name;
export const name = 'Axium CAS';
export const version = pkg.version;
export const description = pkg.description;

export async function statusText(): Promise<string> {
	const items = await count('cas');
	const result = await database
		.selectFrom('cas')
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();
	const size = BigInt(result.size ?? 0).toLocaleString('en-US', {
		notation: 'compact',
		maximumFractionDigits: 2,
		unit: 'byte',
		unitDisplay: 'narrow',
	});
	return `${items} items totaling ${size} bytes`;
}

export async function db_init(opt: InitOptions & WithOutput, db: Database, { warnExists, done }: PluginShortcuts) {
	opt.output('start', 'Creating table cas');
	await db.schema
		.createTable('cas')
		.addColumn('fileId', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('ownerId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').onUpdate('cascade'))
		.addColumn('lastModified', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('restricted', 'boolean', col => col.notNull().defaultTo(false))
		.addColumn('size', 'integer', col => col.notNull().defaultTo(0))
		.addColumn('trashedAt', 'timestamptz', col => col.defaultTo(null))
		.addColumn('hash', 'bytea', col => col.notNull())
		.execute()
		.then(done)
		.catch(warnExists);
}

export async function db_wipe(opt: OpOptions & WithOutput, db: Database) {
	opt.output('start', 'Removing data from cas');
	await db.deleteFrom('cas').execute();
	opt.output('done');
}

export async function db_remove(opt: OpOptions & WithOutput, db: Database) {
	opt.output('start', 'Dropping table cas');
	await db.schema.dropTable('cas').execute();
	opt.output('done');
}
