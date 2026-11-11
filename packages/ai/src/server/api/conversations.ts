import type { AsyncResult } from '@axium/core/api';
import { checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import * as ai from '../../common.js';
import { cancel, emitMessage, emitRemoved, generate, isGenerating, toMessage, withProgress } from '../generation.js';
import { getDefaultModel } from '../models.js';

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
		const init = await parseBody(request, ai.ConversationInit);

		await checkAuthForUser(request, userId);

		const model = init.model ?? (await getDefaultModel());
		if (!model) error(503, 'No model is available');

		return await database
			.insertInto('ai_conversations')
			.values({ title: init.title, titleSource: init.title ? 'user' : 'none', model, reasoning: init.reasoning, userId })
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
		const init = await parseBody(request, ai.ConversationInit);

		await authConversation(request, id);

		return await database
			.updateTable('ai_conversations')
			.set({ ...init, ...(init.title !== undefined && { titleSource: 'user' as const }) })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update conversation'));
	},
	async PUT(request, { id }): AsyncResult<'PUT', 'ai/conversations/:id'> {
		const { content } = await parseBody(request, ai.MessageInit);

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
		const body = await parseBody(request, ai.ConversationAction);

		const conversation = await authConversation(request, id);

		switch (body.action) {
			case 'cancel':
				if (!cancel(id, conversation.userId)) error(409, 'No response is being generated');
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

				if (last?.role != 'assistant' || last.status == 'pending') error(409, 'Only the last finished response can be retried');

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
			case 'edit': {
				if (isGenerating(id)) error(409, 'A response is already being generated');

				const target = await database
					.selectFrom('ai_messages')
					.selectAll()
					.where('id', '=', body.message)
					.where('conversationId', '=', id)
					.executeTakeFirst()
					.catch(withError('Could not get message'));

				if (!target) error(404, 'Message not found');
				if (target.role != 'user') error(409, 'Only your own messages can be edited');

				const { edited, removed, pending } = await database
					.transaction()
					.execute(async tx => ({
						edited: await tx
							.updateTable('ai_messages')
							.set({ content: body.content })
							.where('id', '=', target.id)
							.returningAll()
							.executeTakeFirstOrThrow(),
						removed: await tx
							.deleteFrom('ai_messages')
							.where('conversationId', '=', id)
							.where('created', '>', target.created)
							.returning('id')
							.execute(),
						pending: await tx
							.insertInto('ai_messages')
							.values({ conversationId: id, role: 'assistant', status: 'pending' })
							.returningAll()
							.executeTakeFirstOrThrow(),
					}))
					.catch(withError('Could not edit message'));

				await database
					.updateTable('ai_conversations')
					.set({ modified: new Date() })
					.where('id', '=', id)
					.execute()
					.catch(withError('Could not update conversation'));

				const message = toMessage(pending);
				emitMessage(conversation.userId, toMessage(edited));
				emitRemoved(conversation.userId, { conversationId: id, ids: removed.map(row => row.id) });
				emitMessage(conversation.userId, message);

				void generate(conversation, pending);

				return { message };
			}
		}
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'ai/conversations/:id'> {
		const conversation = await authConversation(request, id);

		cancel(id, conversation.userId);

		return await database
			.deleteFrom('ai_conversations')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete conversation'));
	},
});
