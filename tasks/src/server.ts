import type { AsyncResult } from '@axium/core/api';
import * as acl from '@axium/server/acl';
import { authRequestForItem, checkAuthForUser } from '@axium/server/auth';
import { database, type Schema } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import type schema from '../db.json';
import { TaskInit, TaskListInit, TaskListUpdate, type Task } from './common.js';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

addRoute({
	path: '/api/users/:id/task_lists',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/task_lists'> {
		const { user } = await checkAuthForUser(request, userId);

		const shared = acl.existsIn('task_lists', user, { alias: 'list' });

		const lists = await database
			.selectFrom('task_lists as list')
			.selectAll('list')
			.select(eb =>
				jsonArrayFrom(eb.selectFrom('tasks').selectAll().whereRef('tasks.listId', '=', 'list.id'))
					.$castTo<Task[]>()
					.as('tasks')
			)
			.select(acl.from<'task_lists', Schema & { list: Schema['task_lists'] }>('task_lists', { alias: 'list' }))
			.select(eb => shared(eb).$castTo<boolean>().as('isShared'))
			.where(eb => eb.or([eb('userId', '=', userId), shared(eb)]))
			.execute()
			.catch(withError('Could not get task lists'));

		return lists;
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/task_lists'> {
		const init = await parseBody(request, TaskListInit);

		await checkAuthForUser(request, userId);

		return Object.assign(
			await database
				.insertInto('task_lists')
				.values({ ...init, userId })
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not create task list')),
			{ isShared: false, acl: [] }
		);
	},
});

addRoute({
	path: '/api/task_lists/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'task_lists/:id'> {
		const { item, fromACL } = await authRequestForItem(request, 'task_lists', id, { read: true });

		const tasks = await database
			.selectFrom('tasks')
			.selectAll()
			.where('listId', '=', id)
			.execute()
			.catch(withError('Could not get tasks'));

		return Object.assign(item, { tasks, isShared: fromACL });
	},
	async PUT(request, { id: listId }): AsyncResult<'PUT', 'task_lists/:id'> {
		const init = await parseBody(request, TaskInit.omit({ listId: true }));

		const { fromACL } = await authRequestForItem(request, 'task_lists', listId, { edit: true });

		return Object.assign(
			await database
				.insertInto('tasks')
				.values({ summary: '', ...init, listId })
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update task list')),
			{ isShared: fromACL }
		);
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'task_lists/:id'> {
		const init = await parseBody(request, TaskListInit);

		const { item, fromACL } = await authRequestForItem(request, 'task_lists', id, { edit: true });

		return Object.assign(
			await database
				.updateTable('task_lists')
				.set(init)
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update task list')),
			{ isShared: fromACL, acl: item.acl }
		);
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
		const { item, fromACL } = await authRequestForItem(request, 'task_lists', id, { manage: true });

		return Object.assign(
			await database
				.deleteFrom('task_lists')
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not delete task list')),
			{ isShared: fromACL, acl: item.acl }
		);
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
