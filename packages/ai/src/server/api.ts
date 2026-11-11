import { getConfig } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import { checkAuthForUser, requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import { AIConversationAction, AIConversationInit, AIMessageInit } from '../common.js';
import { cancel, emitMessage, generate, isGenerating, toMessage, withProgress } from './generation.js';
import { getModels } from './models.js';

async function authConversation(request: Request, id: string) {
	const conversation = await database
		.selectFrom('ai_conversations')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirstOrThrow()
		.catch(withError('Conversation not found', 404));

	await checkAuthForUser(request, conversation.userId);

	return conversation;
}

function defaultModel(): string {
	const model = getConfig('@axium/ai').default_model;
	if (!model) error(503, 'No default model is configured');
	return model;
}

addRoute({
	path: '/api/ai/models',
	async GET(request): AsyncResult<'GET', 'ai/models'> {
		await requireSession(request);

		return await getModels();
	},
});

addRoute({
	path: '/api/users/:id/ai/conversations',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/ai/conversations'> {
		await checkAuthForUser(request, userId);

		return await database
			.selectFrom('ai_conversations')
			.selectAll()
			.where('userId', '=', userId)
			.orderBy('modified', 'desc')
			.execute()
			.catch(withError('Could not get conversations'));
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/ai/conversations'> {
		const init = await parseBody(request, AIConversationInit);

		await checkAuthForUser(request, userId);

		return await database
			.insertInto('ai_conversations')
			.values({ title: init.title, model: init.model ?? defaultModel(), reasoning: init.reasoning, userId })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not create conversation'));
	},
});

addRoute({
	path: '/api/ai/conversations/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'ai/conversations/:id'> {
		const conversation = await authConversation(request, id);

		const messages = await database
			.selectFrom('ai_messages')
			.selectAll()
			.where('conversationId', '=', id)
			.orderBy('created')
			.execute()
			.catch(withError('Could not get messages'));

		return { ...conversation, messages: messages.map(row => withProgress(toMessage(row))) };
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'ai/conversations/:id'> {
		const init = await parseBody(request, AIConversationInit);

		await authConversation(request, id);

		return await database
			.updateTable('ai_conversations')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update conversation'));
	},
	async PUT(request, { id }): AsyncResult<'PUT', 'ai/conversations/:id'> {
		const { content } = await parseBody(request, AIMessageInit);

		let conversation = await authConversation(request, id);

		if (isGenerating(id)) error(409, 'A response is already being generated');

		conversation = await database
			.updateTable('ai_conversations')
			.set({ modified: new Date(), title: conversation.title || content.slice(0, 60) })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update conversation'));

		const user = await database
			.insertInto('ai_messages')
			.values({ conversationId: id, role: 'user', content })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not save message'));

		const assistant = await database
			.insertInto('ai_messages')
			.values({ conversationId: id, role: 'assistant', status: 'pending' })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not save message'));

		const messages = [toMessage(user), toMessage(assistant)];
		for (const message of messages) emitMessage(conversation.userId, message);

		void generate(conversation, assistant);

		return messages;
	},
	async POST(request, { id }): AsyncResult<'POST', 'ai/conversations/:id'> {
		const { action } = await parseBody(request, AIConversationAction);

		const conversation = await authConversation(request, id);

		switch (action) {
			case 'cancel':
				if (!cancel(id)) error(409, 'No response is being generated');
				return {};
			case 'retry': {
				if (isGenerating(id)) error(409, 'A response is already being generated');

				const last = await database
					.selectFrom('ai_messages')
					.selectAll()
					.where('conversationId', '=', id)
					.orderBy('created', 'desc')
					.limit(1)
					.executeTakeFirst()
					.catch(withError('Could not get messages'));

				if (last?.role != 'assistant' || last.status == 'pending')
					error(409, 'Only the last finished response can be retried');

				const pending = await database
					.updateTable('ai_messages')
					.set({ content: '', reasoning: null, status: 'pending', error: null, usage: null })
					.where('id', '=', last.id)
					.returningAll()
					.executeTakeFirstOrThrow()
					.catch(withError('Could not update message'));

				const message = toMessage(pending);
				emitMessage(conversation.userId, message);

				void generate(conversation, pending);

				return { message };
			}
		}
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'ai/conversations/:id'> {
		await authConversation(request, id);

		cancel(id);

		return await database
			.deleteFrom('ai_conversations')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete conversation'));
	},
});
