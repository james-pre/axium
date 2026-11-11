import type { AsyncResult } from '@axium/core/api';
import { checkAuthForUser } from '@axium/server/auth';
import { database, type Schema } from '@axium/server/database';
import type { Selectable } from 'kysely';
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

type ConversationRow = Selectable<Schema['ai_conversations']>;
type MessageRow = Selectable<Schema['ai_messages']>;

/** Removes the messages after `from`, one of the user's, and responds to it again, with new content if given */
async function restart(conversation: ConversationRow, from: MessageRow, content?: string): Promise<ai.Message> {
	const { edited, removed, pending } = await database
		.transaction()
		.execute(async tx => ({
			edited:
				content === undefined
					? from
					: await tx
							.updateTable('ai_messages')
							.set({ content })
							.where('id', '=', from.id)
							.returningAll()
							.executeTakeFirstOrThrow(),
			removed: await tx
				.deleteFrom('ai_messages')
				.where('conversationId', '=', conversation.id)
				.where('created', '>', eb => eb.selectFrom('ai_messages').select('created').where('id', '=', from.id))
				.returning('id')
				.execute(),
			pending: await tx
				.insertInto('ai_messages')
				.values({ conversationId: conversation.id, role: 'assistant', status: 'pending' })
				.returningAll()
				.executeTakeFirstOrThrow(),
		}))
		.catch(withError('Could not restart the response'));

	await database
		.updateTable('ai_conversations')
		.set({ modified: new Date() })
		.where('id', '=', conversation.id)
		.execute()
		.catch(withError('Could not update conversation'));

	const message = toMessage(pending);
	if (content !== undefined) emitMessage(conversation.userId, toMessage(edited));
	emitRemoved(conversation.userId, { conversationId: conversation.id, ids: removed.map(row => row.id) });
	emitMessage(conversation.userId, message);

	void generate(conversation, pending);

	return message;
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
					.where('role', '=', 'user')
					.orderBy('created', 'desc')
					.limit(1)
					.executeTakeFirst()
					.catch(withError('Could not get messages'));

				if (!last) error(409, 'There is nothing to retry');

				return { message: await restart(conversation, last) };
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

				return { message: await restart(conversation, target, body.content) };
			}
			case 'decide': {
				if (isGenerating(id)) error(409, 'A response is already being generated');

				const awaiting = await database
					.selectFrom('ai_messages')
					.select('id')
					.where('conversationId', '=', id)
					.where('status', '=', 'awaiting')
					.execute()
					.catch(withError('Could not get messages'));

				if (!awaiting.length) error(409, 'No tool calls are awaiting approval');

				const pending = await database
					.insertInto('ai_messages')
					.values({ conversationId: id, role: 'assistant', status: 'pending' })
					.returningAll()
					.executeTakeFirstOrThrow()
					.catch(withError('Could not save message'));

				const message = toMessage(pending);
				emitMessage(conversation.userId, message);

				void generate(conversation, pending, body.decisions);

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
