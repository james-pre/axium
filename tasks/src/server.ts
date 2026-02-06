import type { AsyncResult } from '@axium/core/api';
import { authRequestForItem, checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { Generated, GeneratedAlways } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import { TaskInit, TaskListInit, TaskListUpdate, type Task } from './common.js';

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
			name: string;
			description?: string | null;
		};
		'acl.task_lists': DBAccessControl & DBBool<'read' | 'edit' | 'manage'>;
	}
}

addRoute({
	path: '/api/users/:id/task_lists',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/task_lists'> {
		await checkAuthForUser(request, userId);

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
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/task_lists'> {
		const init = await parseBody(request, TaskListInit);

		await checkAuthForUser(request, userId);

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
	async GET(request, { id }): AsyncResult<'GET', 'task_lists/:id'> {
		const { item } = await authRequestForItem(request, 'task_lists', id, { read: true });

		const tasks = await database
			.selectFrom('tasks')
			.selectAll()
			.where('listId', '=', id)
			.execute()
			.catch(withError('Could not get tasks'));

		return Object.assign(item, { tasks });
	},
	async PUT(request, { id: listId }): AsyncResult<'PUT', 'task_lists/:id'> {
		const init = await parseBody(request, TaskInit.omit({ listId: true }));

		await authRequestForItem(request, 'task_lists', listId, { edit: true });

		return await database
			.insertInto('tasks')
			.values({ summary: '', ...init, listId })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update task list'));
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'task_lists/:id'> {
		await authRequestForItem(request, 'task_lists', id, { edit: true });

		const init = await parseBody(request, TaskListInit);

		return await database
			.updateTable('task_lists')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update task list'));
	},
	async POST(request, { id }): AsyncResult<'POST', 'task_lists/:id'> {
		const body = await parseBody(request, TaskListUpdate);

		await authRequestForItem(request, 'task_lists', id, { edit: true });

		if (typeof body.all_completed == 'boolean') {
			await database
				.updateTable('tasks')
				.set('completed', body.all_completed)
				.where('listId', '=', id)
				.where('completed', '=', !body.all_completed)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update task list'));
		}

		return {};
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'task_lists/:id'> {
		await authRequestForItem(request, 'task_lists', id, { manage: true });

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
	async PATCH(request, { id }): AsyncResult<'PATCH', 'tasks/:id'> {
		const init = await parseBody(request, TaskInit.omit({ listId: true }));

		const task = await database
			.selectFrom('tasks')
			.select('listId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not get task'));

		await authRequestForItem(request, 'task_lists', task.listId, { edit: true });

		return await database
			.updateTable('tasks')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update task'));
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'tasks/:id'> {
		const task = await database
			.selectFrom('tasks')
			.select('listId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not fetch task'));

		await authRequestForItem(request, 'task_lists', task.listId, { manage: true });

		return await database
			.deleteFrom('tasks')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete task'));
	},
});
