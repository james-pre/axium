import type { Result } from '@axium/core/api';
import config from '@axium/server/config';
import type { Database, InitOptions, OpOptions, Schema } from '@axium/server/database';
import { count, warnExists } from '@axium/server/database';
import { done, start } from '@axium/server/io';
import type { Plugin } from '@axium/server/plugins';
import { parseBody } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { error } from '@sveltejs/kit';
import z from 'zod/v4';
import pkg from '../package.json' with { type: 'json' };
import { createShare } from './server.js';

async function statusText(): Promise<string> {
	let text = '';
	for (const table of config.shares) {
		const shares = await count(`shares.${table}`);
		text += `${shares} ${table} shares\n`;
	}
	return text;
}

async function db_init(opt: InitOptions, db: Database) {
	start('Creating schema shares');
	await db.schema.createSchema('shares').execute().then(done).catch(warnExists);

	for (const table of config.shares) {
		start('Creating table ' + `shares.${table}`);
		await db.schema
			.createTable(`shares.${table}`)
			.addColumn('itemId', 'uuid', col => col.notNull().references(`${table}.id`).onDelete('cascade').onUpdate('cascade'))
			.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade').onUpdate('cascade'))
			.addColumn('sharedAt', 'timestamptz', col => col.notNull())
			.addColumn('permission', 'integer', col => col.notNull())
			.execute()
			.then(done)
			.catch(warnExists);

		start(`Creating index for shares.${table}.userId`);
		await db.schema
			.createIndex(`shares.${table}_userId_index`)
			.on(`shares.${table}`)
			.column('userId')
			.execute()
			.then(done)
			.catch(warnExists);

		start(`Creating index for shares.${table}.itemId`);
		await db.schema
			.createIndex(`shares.${table}_itemId_index`)
			.on(`shares.${table}`)
			.column('itemId')
			.execute()
			.then(done)
			.catch(warnExists);
	}
}

async function db_wipe(opt: OpOptions, db: Database) {
	for (const table of config.shares) {
		start('Wiping table ' + table);
		await db.deleteFrom(`shares.${table}`).execute();
		done();
	}
}

async function remove(opt: OpOptions, db: Database) {
	start('Removing schema shares');
	await db.schema.dropSchema('shares').execute().then(done);
}

export default {
	...pkg,
	statusText,
	hooks: { db_init, db_wipe, remove },
} satisfies Plugin;

addRoute({
	path: '/api/share/:itemType',
	params: {
		itemType: z.string(),
	},
	async PUT(event): Result<'PUT', 'share/:itemType'> {
		const type = event.params.itemType as keyof Schema;

		if (!config.shares.includes(type)) {
			error(400, 'Invalid item type');
		}

		const data = await parseBody(
			event,
			z.object({
				itemId: z.uuid(),
				userId: z.uuid(),
				permission: z.number().int().min(0).max(5),
			})
		);

		const share = await createShare(type, data).catch(e => error(503, 'Could not create share'));

		return share;
	},
});
