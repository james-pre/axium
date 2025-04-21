import type { Database, InitOptions, OpOptions, PluginShortcuts } from '@axium/server/database.js';
import { count } from '@axium/server/database.js';
import pkg from '../package.json' with { type: 'json' };
import type { WithOutput } from '@axium/server/io.js';
import config from '@axium/server/config.js';

export const id = pkg.name;
export const name = 'Axium Shares';
export const version = pkg.version;
export const description = pkg.description;

export async function statusText(): Promise<string> {
	let text = '';
	for (const table of config.shares) {
		const shares = await count(`shares.${table}`);
		text += `${shares} ${table} shares\n`;
	}
	return text;
}

export async function db_init(opt: InitOptions & WithOutput, db: Database, { warnExists, done }: PluginShortcuts) {
	opt.output('start', 'Creating schema shares');
	await db.schema.createSchema('shares').execute().then(done).catch(warnExists);

	for (const table of config.shares) {
		opt.output('start', 'Creating table shares.' + table);
		await db.schema
			.createTable(`shares.${table.replaceAll('.', '_')}`)
			.addColumn('itemId', 'uuid', col => col.notNull().references(`${table}.id`).onDelete('cascade').onUpdate('cascade'))
			.addColumn('userId', 'uuid', col => col.notNull().references('User.id').onDelete('cascade').onUpdate('cascade'))
			.addColumn('sharedAt', 'timestamptz', col => col.notNull())
			.addColumn('permission', 'integer', col => col.notNull())
			.execute()
			.then(done)
			.catch(warnExists);

		opt.output('start', `Creating index for shares.${table}.userId`);
		await db.schema
			.createIndex(`shares.${table.replaceAll('.', '_')}_userId_index`)
			.on(`shares.${table.replaceAll('.', '_')}`)
			.column('userId')
			.execute()
			.then(done)
			.catch(warnExists);

		opt.output('start', `Creating index for shares.${table}.itemId`);
		await db.schema
			.createIndex(`shares.${table.replaceAll('.', '_')}_itemId_index`)
			.on(`shares.${table.replaceAll('.', '_')}`)
			.column('itemId')
			.execute()
			.then(done)
			.catch(warnExists);
	}
}

export async function db_wipe(opt: OpOptions & WithOutput, db: Database) {
	for (const table of config.shares) {
		opt.output('start', 'Wiping table shares.' + table);
		await db.withSchema('shares').deleteFrom(table).execute();
		opt.output('done');
	}
}
