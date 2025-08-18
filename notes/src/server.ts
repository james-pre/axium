import { Permission, type Result } from '@axium/core';
import { checkAuthForItem, checkAuthForUser } from '@axium/server/auth';
import { database, expectedTypes } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { Generated, GeneratedAlways } from 'kysely';
import * as z from 'zod';
import { NoteInit, type Note } from './common.js';

declare module '@axium/server/database' {
	export interface Schema {
		notes: {
			id: GeneratedAlways<string>;
			userId: string;
			created: GeneratedAlways<Date>;
			modified: GeneratedAlways<Date>;
			title: string;
			content: string;
			publicPermission: Generated<Permission>;
			labels: Generated<string[]>;
		};
	}

	export interface ExpectedSchema {
		notes: ColumnTypes<Schema['notes']>;
	}
}

expectedTypes.notes = {
	id: { type: 'uuid', required: true, hasDefault: true },
	userId: { type: 'uuid', required: true },
	created: { type: 'timestamptz', required: true, hasDefault: true },
	modified: { type: 'timestamptz', required: true, hasDefault: true },
	title: { type: 'text', required: true },
	content: { type: 'text', required: true },
	publicPermission: { type: 'int4', required: true, hasDefault: true },
	labels: { type: '_text', required: false, hasDefault: true },
};

addRoute({
	path: '/api/users/:id/notes',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'users/:id/notes'> {
		const userId = event.params.id!;
		await checkAuthForUser(event, userId);

		return await database
			.selectFrom('notes')
			.selectAll()
			.where('userId', '=', userId)
			.execute()
			.catch(withError('Could not get notes'));
	},
	async PUT(event): Result<'PUT', 'users/:id/notes'> {
		const init = await parseBody(event, NoteInit);

		const userId = event.params.id!;
		await checkAuthForUser(event, userId);

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
	async GET(event): Result<'GET', 'notes/:id'> {
		const id = event.params.id!;

		const { item } = await checkAuthForItem<Note>(event, 'notes', id, Permission.Read);

		return item;
	},
	async PATCH(event): Result<'PATCH', 'notes/:id'> {
		const init = await parseBody(event, NoteInit);

		const id = event.params.id!;

		await checkAuthForItem(event, 'notes', id, Permission.Edit);

		return await database
			.updateTable('notes')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update note'));
	},
	async DELETE(event): Result<'DELETE', 'notes/:id'> {
		const id = event.params.id!;

		await checkAuthForItem(event, 'notes', id, Permission.Manage);

		return await database
			.deleteFrom('notes')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete note'));
	},
});
