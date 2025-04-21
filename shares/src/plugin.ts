import type { Database, InitOptions, OpOptions, PluginShortcuts } from '@axium/server/database.js';
import { count } from '@axium/server/database.js';
import pkg from '../package.json' with { type: 'json' };
import type { WithOutput } from '@axium/server/io.js';
import config from '@axium/server/config.js';
import { sharesTableFor } from './server.js';

export const id = pkg.name;
export const name = 'Axium Shares';
export const version = pkg.version;
export const description = pkg.description;

export async function statusText(): Promise<string> {
	let text = '';
	for (const table of config.shares) {
		const shares = await count(sharesTableFor(table));
		text += `${shares} ${table} shares\n`;
	}
	return text;
}

export async function db_init(opt: InitOptions & WithOutput, db: Database, { warnExists, done }: PluginShortcuts) {
	opt.output('start', 'Creating schema shares');
	await db.schema.createSchema('shares').execute().then(done).catch(warnExists);

	for (const table of config.shares) {
		const shareTable = sharesTableFor(table);
		opt.output('start', 'Creating table ' + shareTable);
		await db.schema
			.createTable(shareTable)
			.addColumn('itemId', 'uuid', col => col.notNull().references(`${table}.id`).onDelete('cascade').onUpdate('cascade'))
			.addColumn('userId', 'uuid', col => col.notNull().references('User.id').onDelete('cascade').onUpdate('cascade'))
			.addColumn('sharedAt', 'timestamptz', col => col.notNull())
			.addColumn('permission', 'integer', col => col.notNull())
			.execute()
			.then(done)
			.catch(warnExists);

		opt.output('start', `Creating index for ${shareTable}.userId`);
		await db.schema.createIndex(`${shareTable}_userId_index`).on(shareTable).column('userId').execute().then(done).catch(warnExists);

		opt.output('start', `Creating index for ${shareTable}.itemId`);
		await db.schema.createIndex(`${shareTable}_itemId_index`).on(shareTable).column('itemId').execute().then(done).catch(warnExists);
	}
}

export async function db_wipe(opt: OpOptions & WithOutput, db: Database) {
	for (const table of config.shares) {
		opt.output('start', 'Wiping table ' + table);
		await db.deleteFrom(sharesTableFor(table)).execute();
		opt.output('done');
	}
}
