import type { AsyncResult } from '@axium/core/api';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import * as ai from '../../common.js';
import { cancel, emitMessage, generateTemporary, isGenerating } from '../generation.js';

addRoute({
	path: '/api/ai/temporary/:id',
	params: { id: z.uuid() },
	async PUT(request, { id }): AsyncResult<'PUT', 'ai/temporary/:id'> {
		const init = await parseBody(request, ai.TemporaryInit);
		const { userId } = await requireSession(request);

		if (isGenerating(id)) error(409, 'A response is already being generated');

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
		};

		emitMessage(userId, pending);

		void generateTemporary(userId, init, pending);

		return pending;
	},
	async POST(request, { id }): AsyncResult<'POST', 'ai/temporary/:id'> {
		await parseBody(request, z.object({ action: z.literal('cancel') }));
		const { userId } = await requireSession(request);

		if (!cancel(id, userId)) error(409, 'No response is being generated');
		return {};
	},
});
