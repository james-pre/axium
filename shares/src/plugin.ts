import type { Database, InitOptions, OpOptions, PluginShortcuts } from '@axium/server/database.js';
import pkg from '../package.json' with { type: 'json' };
import type { WithOutput } from '@axium/server/io.js';
import config from '@axium/server/config.js';

export const id = pkg.name;
export const name = 'Axium Shares';
export const version = pkg.version;
export const description = pkg.description;

export async function statusText() {}

export async function db_init(opt: InitOptions & WithOutput, db: Database, { warnExists, done }: PluginShortcuts) {
	opt.output('start', 'Creating schema shares');
	await db.schema.createSchema('shares').execute().then(done).catch(warnExists);

	for (const table of config.shares) {
		opt.output('start', 'Creating table shares.' + table);
		await db.schema
			.withSchema('shares')
			.createTable(table)
			.addColumn('itemId', 'uuid', col => col.notNull().references(`public.${table}.id`).onDelete('cascade').onUpdate('cascade'))
			.addColumn('userId', 'uuid', col => col.notNull().references('public.User.id').onDelete('cascade').onUpdate('cascade'))
			.addColumn('sharedAt', 'timestamptz', col => col.notNull())
			.addColumn('permission', 'integer', col => col.notNull())
			.execute()
			.then(done)
			.catch(warnExists);

		opt.output('start', `Creating index for shares.${table}.userId`);
		await db.schema.withSchema('shares').createIndex(`shares_${table}_userId_index`).on(`shares.${table}`).column('userId').execute().then(done).catch(warnExists);

		opt.output('start', `Creating index for shares.${table}.itemId`);
		await db.schema.withSchema('shares').createIndex(`shares_${table}_itemId_index`).on(`shares.${table}`).column('itemId').execute().then(done).catch(warnExists);
	}
}

export async function db_wipe(opt: OpOptions & WithOutput, db: Database) {
	for (const table of config.shares) {
		opt.output('start', 'Wiping table shares.' + table);
		await db.withSchema('shares').deleteFrom(table).execute();
		opt.output('done');
	}
}
