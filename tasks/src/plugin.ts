import * as acl from '@axium/server/acl';
import { addApp } from '@axium/server/apps';
import { count, createIndex, database, warnExists } from '@axium/server/database';
import { done, start } from '@axium/server/io';
import type { Plugin } from '@axium/server/plugins';
import { sql } from 'kysely';
import pkg from '../package.json' with { type: 'json' };
import './common.js';
import './server.js';

async function statusText(): Promise<string> {
	const { tasks, task_lists } = await count('tasks', 'task_lists');

	return `${tasks} tasks, ${task_lists} lists`;
}

async function db_init(): Promise<void> {
	start('Creating table tasks');
	await database.schema
		.createTable('tasks')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('listId', 'uuid', col => col.notNull().references('task_lists.id').onDelete('cascade'))
		.addColumn('summary', 'text', col => col.notNull())
		.addColumn('description', 'text')
		.addColumn('parentId', 'uuid', col => col.references('tasks.id').onDelete('cascade'))
		.addColumn('completed', 'boolean', col => col.notNull().defaultTo(false))
		.addColumn('due', 'timestamptz')
		.execute()
		.then(done)
		.catch(warnExists);

	await createIndex('tasks', 'userId');
	await createIndex('tasks', 'listId');
	await createIndex('tasks', 'parentId');

	start('Creating table task_lists');
	await database.schema
		.createTable('task_lists')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
		.addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
		.addColumn('publicPermission', 'integer', col => col.notNull().defaultTo(0))
		.addColumn('name', 'text', col => col.notNull())
		.addColumn('description', 'text')
		.execute()
		.then(done)
		.catch(warnExists);

	await createIndex('task_lists', 'userId');
}

async function db_wipe(): Promise<void> {
	start('Wiping data from tasks');
	await database.deleteFrom('tasks').execute().then(done);

	start('Wiping data from task_lists');
	await database.deleteFrom('task_lists').execute().then(done);
}

async function remove() {
	start('Dropping table tasks');
	await database.schema.dropTable('tasks').execute().then(done);

	start('Dropping table task_lists');
	await database.schema.dropTable('task_lists').execute().then(done);
	await acl.dropTable('task_lists');
}

addApp({
	id: 'tasks',
	name: 'Tasks',
	icon: 'list-check',
	version: pkg.version,
});

export default {
	...pkg,
	statusText,
	hooks: { db_init, db_wipe, remove },
} satisfies Plugin;
