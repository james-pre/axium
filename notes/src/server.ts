import type { AsyncResult } from '@axium/core';
import { authRequestForItem, checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import type schema from '../db.json';
import { NoteInit } from './common.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

addRoute({
	path: '/api/users/:id/notes',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/notes'> {
		await checkAuthForUser(request, userId);

		return await database
			.selectFrom('notes')
			.selectAll()
			.where('userId', '=', userId)
			.execute()
			.catch(withError('Could not get notes'));
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/notes'> {
		const init = await parseBody(request, NoteInit);

		await checkAuthForUser(request, userId);

		return await database
			.insertInto('notes')
			.values({ ...init, userId })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not create note'));
	},
});

addRoute({
	path: '/api/notes/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'notes/:id'> {
		const { item } = await authRequestForItem(request, 'notes', id, { read: true });

		return item;
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'notes/:id'> {
		const init = await parseBody(request, NoteInit);

		await authRequestForItem(request, 'notes', id, { edit: true });

		return await database
			.updateTable('notes')
			.set(init)
			.set('modified', new Date())
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update note'));
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'notes/:id'> {
		await authRequestForItem(request, 'notes', id, { manage: true });

		return await database
			.deleteFrom('notes')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete note'));
	},
});
