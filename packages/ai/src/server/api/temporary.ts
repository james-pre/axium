import type { AsyncResult } from '@axium/core/api';
import { requireSession, type SessionAndUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import * as ai from '../../common.js';
import { cancel, emitMessage, generateTemporary, isGenerating, temporaryContext } from '../generation.js';
import * as sandbox from '../sandbox.js';

/** Refuses system messages anywhere in the history from users who aren't administrators */
function checkSystemMessages(messages: ai.TemporaryMessage[], session: SessionAndUser): void {
	if (session.user.isAdmin || !messages.some(message => message.role == 'system')) return;
	error(403, 'Only administrators can send system messages');
}

addRoute({
	path: '/api/ai/temporary/:id',
	params: { id: z.uuid() },
	async PUT(request, { id }): AsyncResult<'PUT', 'ai/temporary/:id'> {
		const init = await parseBody(request, ai.TemporaryInit);
		const session = await requireSession(request);
		const { userId, timezone } = session;

		checkSystemMessages(init.messages, session);
		if (isGenerating(id)) error(409, 'A response is already being generated');

		const last = init.messages.at(-1)!;
		const deciding = !!init.decisions && init.messages.some(message => message.status == 'awaiting');
		if (!deciding && (last.role != 'user' || !last.content.trim())) {
			error(400, 'The last message must be from the user, unless deciding on tool calls');
		}

		const saved = await database.selectFrom('ai_conversations').select('id').where('id', '=', id).executeTakeFirst();
		if (saved) error(409, 'A saved conversation has this ID');

		const pending: ai.Message = {
			id: randomUUID(),
			conversationId: id,
			created: new Date(),
			role: 'assistant',
			content: '',
			reasoning: null,
			toolCalls: null,
			toolCallId: null,
			status: 'pending',
			error: null,
			usage: null,
			voice: false,
			attachments: null,
		};

		emitMessage(userId, pending);

		void generateTemporary(userId, init, pending, timezone);

		return pending;
	},
	async POST(request, { id }): AsyncResult<'POST', 'ai/temporary/:id'> {
		const { action } = await parseBody(request, ai.TemporaryAction);
		const { userId } = await requireSession(request);

		switch (action) {
			case 'cancel':
				if (!cancel(id, userId)) error(409, 'No response is being generated');
				return {};
			case 'end':
				cancel(id, userId);
				await sandbox.remove(userId, id, true).catch(withError('Could not delete the sandbox'));
				return {};
		}
	},
});

addRoute({
	path: '/api/ai/temporary/:id/context',
	params: { id: z.uuid() },
	async POST(request, { id }): AsyncResult<'POST', 'ai/temporary/:id/context'> {
		const init = await parseBody(request, ai.TemporaryContext);
		const session = await requireSession(request);
		const { userId, timezone } = session;

		checkSystemMessages(init.messages, session);
		if (init.prompt && !session.user.isAdmin) error(403, 'Only administrators can view the system prompt');

		return await temporaryContext(userId, id, init, { timeZone: timezone, signal: request.signal }).catch(
			withError('Could not measure the context', 503)
		);
	},
});
