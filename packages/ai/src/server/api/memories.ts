import { getConfig } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import features from '@axium/core/features';
import { checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import * as memory from '../../memory.js';
import { getMemories, getStatus, startUpdate, updatesEnabled } from '../memory.js';
import { getPreferences } from '../preferences.js';

function checkWrite(content?: string): void {
	if (!features('ai-memory')) error(403, 'Memory is disabled on this server');

	const limit = getConfig('@axium/ai').max_memory_length;
	if (content && content.length > limit)
		error(400, `A memory's content can have at most ${limit} characters; this has ${content.length}`);
}

async function exists(userId: string, id: string): Promise<boolean> {
	const row = await database
		.selectFrom('ai_memories')
		.select('id')
		.where('userId', '=', userId)
		.where('id', '=', id)
		.executeTakeFirst()
		.catch(withError('Could not get memory'));
	return !!row;
}

addRoute({
	path: '/api/users/:id/ai/memories',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/ai/memories'> {
		await checkAuthForUser(request, userId);

		const config = getConfig('@axium/ai');
		return { memories: await getMemories(userId), limit: config.max_memories, maxLength: config.max_memory_length };
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/ai/memories'> {
		const init = await parseBody(request, memory.Init);

		await checkAuthForUser(request, userId);
		checkWrite(init.content);

		if (await exists(userId, init.id)) error(409, `A memory with the ID "${init.id}" already exists; update it instead`);

		const limit = getConfig('@axium/ai').max_memories;
		const { count } = await database
			.selectFrom('ai_memories')
			.select(eb => eb.fn.countAll<string>().as('count'))
			.where('userId', '=', userId)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not count memories'));
		if (Number(count) >= limit) error(409, `Memory is full (${limit} memories); delete one before adding another`);

		if (init.conversationId) {
			await database
				.selectFrom('ai_conversations')
				.select('id')
				.where('id', '=', init.conversationId)
				.where('userId', '=', userId)
				.executeTakeFirstOrThrow()
				.catch(withError('Conversation not found', 404));
		}

		return await database
			.insertInto('ai_memories')
			.values({ ...init, userId })
			.returningAll()
			.$castTo<memory.Node>()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not save memory'));
	},
});

addRoute({
	path: '/api/users/:id/ai/memories/:memory',
	params: { id: z.uuid(), memory: memory.Id },
	async GET(request, { id: userId, memory: id }): AsyncResult<'GET', 'users/:id/ai/memories/:memory'> {
		await checkAuthForUser(request, userId);

		return await database
			.selectFrom('ai_memories')
			.selectAll()
			.where('userId', '=', userId)
			.where('id', '=', id)
			.$castTo<memory.Node>()
			.executeTakeFirstOrThrow()
			.catch(withError(`No memory has the ID "${id}"`));
	},
	async PATCH(request, { id: userId, memory: id }): AsyncResult<'PATCH', 'users/:id/ai/memories/:memory'> {
		const update = await parseBody(request, memory.Update);

		await checkAuthForUser(request, userId);
		checkWrite(update.content);

		if (update.id && update.id != id && (await exists(userId, update.id))) {
			error(409, `A memory with the ID "${update.id}" already exists`);
		}

		return await database
			.updateTable('ai_memories')
			.set({ ...update, modified: new Date() })
			.where('userId', '=', userId)
			.where('id', '=', id)
			.returningAll()
			.$castTo<memory.Node>()
			.executeTakeFirstOrThrow()
			.catch(withError(`No memory has the ID "${id}"`));
	},
	async DELETE(request, { id: userId, memory: id }): AsyncResult<'DELETE', 'users/:id/ai/memories/:memory'> {
		await checkAuthForUser(request, userId);

		return await database
			.deleteFrom('ai_memories')
			.where('userId', '=', userId)
			.where('id', '=', id)
			.returningAll()
			.$castTo<memory.Node>()
			.executeTakeFirstOrThrow()
			.catch(withError(`No memory has the ID "${id}"`));
	},
});

addRoute({
	path: '/api/users/:id/ai/memory_updates',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/ai/memory_updates'> {
		await checkAuthForUser(request, userId);
		return await getStatus(userId).catch(withError('Could not get memory updates'));
	},
	async POST(request, { id: userId }): AsyncResult<'POST', 'users/:id/ai/memory_updates'> {
		await parseBody(request, z.object({}));
		await checkAuthForUser(request, userId);

		if (!updatesEnabled()) error(403, 'Memory updates are disabled on this server');
		if (!(await getPreferences(userId)).tools.memory) error(409, 'Memory is turned off in your AI preferences');

		await startUpdate(userId).catch(withError('Could not start a memory update'));
		return await getStatus(userId).catch(withError('Could not get memory updates'));
	},
});
