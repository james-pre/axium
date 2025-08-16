import { Permission, type Result } from '@axium/core';
import { checkAuthForItem, checkAuthForUser } from '@axium/server/auth';
import { database, expectedTypes } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { Generated, GeneratedAlways } from 'kysely';
import * as z from 'zod';
import { TaskInit, TaskListInit, type Task, type TaskList } from './common.js';
import { jsonArrayFrom } from 'kysely/helpers/postgres';

declare module '@axium/server/database' {
	export interface Schema {
		tasks: {
			id: GeneratedAlways<string>;
			created: GeneratedAlways<Date>;
			summary: string;
			description?: string | null;
			listId: string;
			parentId?: string | null;
			completed: Generated<boolean>;
			due?: Date | null;
		};
		task_lists: {
			id: GeneratedAlways<string>;
			userId: string;
			created: GeneratedAlways<Date>;
			publicPermission: Generated<Permission>;
			name: string;
			description?: string | null;
		};
	}

	export interface ExpectedSchema {
		tasks: ColumnTypes<Schema['tasks']>;
		task_lists: ColumnTypes<Schema['task_lists']>;
	}
}

expectedTypes.tasks = {
	id: { type: 'uuid', required: true, hasDefault: true },
	created: { type: 'timestamptz', required: true, hasDefault: true },
	summary: { type: 'text', required: true },
	description: { type: 'text' },
	listId: { type: 'uuid', required: true },
	parentId: { type: 'uuid' },
	completed: { type: 'bool', required: true, hasDefault: true },
	due: { type: 'timestamptz' },
};

expectedTypes.task_lists = {
	id: { type: 'uuid', required: true, hasDefault: true },
	userId: { type: 'uuid', required: true },
	created: { type: 'timestamptz', required: true, hasDefault: true },
	publicPermission: { type: 'int4', required: true, hasDefault: true },
	name: { type: 'text', required: true },
	description: { type: 'text' },
};

addRoute({
	path: '/api/users/:id/task_lists',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'users/:id/task_lists'> {
		const userId = event.params.id!;
		await checkAuthForUser(event, userId);

		const lists = await database
			.selectFrom('task_lists')
			.selectAll()
			.select(eb =>
				jsonArrayFrom<Task>(eb.selectFrom('tasks').selectAll().whereRef('tasks.listId', '=', 'task_lists.id')).as('tasks')
			)
			.where('userId', '=', userId)
			.execute()
			.catch(withError('Could not get task lists'));

		return lists.map(list => ({
			...list,
			tasks: list.tasks.map(t => ({ ...t, created: new Date(t.created), due: t.due ? new Date(t.due) : null })),
		}));
	},
	async PUT(event): Result<'PUT', 'users/:id/task_lists'> {
		const init = await parseBody(event, TaskListInit);

		const userId = event.params.id!;
		await checkAuthForUser(event, userId);

		return await database
			.insertInto('task_lists')
			.values({ ...init, userId })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not create task list'));
	},
});

addRoute({
	path: '/api/task_lists/:id',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'task_lists/:id'> {
		const id = event.params.id!;

		const { item } = await checkAuthForItem<TaskList>(event, 'task_lists', id, Permission.Read);

		const tasks = await database
			.selectFrom('tasks')
			.selectAll()
			.where('listId', '=', id)
			.execute()
			.catch(withError('Could not get tasks'));

		return Object.assign(item, { tasks });
	},
	async PATCH(event): Result<'PATCH', 'task_lists/:id'> {
		const id = event.params.id!;
		await checkAuthForItem<TaskList>(event, 'task_lists', id, Permission.Edit);

		const init = await parseBody(event, TaskListInit);

		return await database
			.updateTable('task_lists')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update task list'));
	},
	async DELETE(event): Result<'DELETE', 'task_lists/:id'> {
		const id = event.params.id!;
		await checkAuthForItem<TaskList>(event, 'task_lists', id, Permission.Manage);

		return await database
			.deleteFrom('task_lists')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete task list'));
	},
});

addRoute({
	path: '/api/tasks/:id',
	params: { id: z.uuid() },
	async PATCH(event): Result<'PATCH', 'tasks/:id'> {
		const init = await parseBody(event, TaskInit);

		const id = event.params.id!;
		const task = await database
			.selectFrom('tasks')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not get task'));

		if (init.listId != task.listId) {
			if (init.listId) await checkAuthForItem(event, 'task_lists', init.listId, Permission.Edit);
			if (task.listId) await checkAuthForItem(event, 'task_lists', task.listId, Permission.Edit);
		}

		return await database
			.updateTable('tasks')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update task'));
	},
	async DELETE(event): Result<'DELETE', 'tasks/:id'> {
		const id = event.params.id!;
		const task = await database
			.selectFrom('tasks')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not fetch task'));

		await checkAuthForItem(event, 'task_lists', task.listId, Permission.Manage);

		return await database
			.deleteFrom('tasks')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete task'));
	},
});
