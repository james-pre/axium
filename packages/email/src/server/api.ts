import type { AsyncResult } from '@axium/core';
import { checkAuthForUser } from '@axium/server/auth';
import { database, type Schema } from '@axium/server/database';
import { error, parseBody, parseSearch, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import { EmailChangeable, EmailInit, EmailListQuery, type Attachment, type Email } from '../common.js';
import './db.js';
import { makeSnippet, send } from './send.js';

function withAttachments(eb: ExpressionBuilder<Schema, 'emails'>) {
	return jsonArrayFrom(
		eb
			.selectFrom('email_attachments')
			.select(['id', 'emailId', 'filename', 'contentType', 'size'])
			.whereRef('email_attachments.emailId', '=', 'emails.id')
	)
		.$castTo<Attachment[]>()
		.as('attachments');
}

/** Fetch a message and check that the requesting user owns its mailbox */
async function authEmail(request: Request, id: string): Promise<Email> {
	const email = await database
		.selectFrom('emails')
		.selectAll()
		.select(withAttachments)
		.where('id', '=', id)
		.executeTakeFirstOrThrow()
		.catch(withError('Email does not exist', 404));

	await checkAuthForUser(request, email.userId);

	return email;
}

const draftOnlyFields = ['to', 'cc', 'bcc', 'subject', 'text'] as const;

addRoute({
	path: '/api/users/:id/email',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/email'> {
		await checkAuthForUser(request, userId);

		const query = parseSearch(request, EmailListQuery);

		return await database
			.selectFrom('emails')
			.selectAll()
			.select(withAttachments)
			.where('userId', '=', userId)
			.$if(!!query.starred, qb => qb.where('starred', '=', true).where('folder', 'not in', ['trash', 'spam']))
			.$if(!query.starred, qb => qb.where('folder', '=', query.folder ?? 'inbox'))
			.orderBy('date', 'desc')
			.limit(query.limit)
			.offset(query.offset)
			.execute()
			.catch(withError('Could not get emails'));
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/email'> {
		const init = await parseBody(request, EmailInit);

		const { user } = await checkAuthForUser(request, userId);

		return await send(user, init);
	},
});

addRoute({
	path: '/api/email/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'email/:id'> {
		return await authEmail(request, id);
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'email/:id'> {
		const changes = await parseBody(request, EmailChangeable);

		const email = await authEmail(request, id);

		if (email.folder != 'drafts' && draftOnlyFields.some(field => field in changes))
			error(400, 'Only drafts can have their content changed');

		const { to, cc, bcc, ...rest } = changes;

		return Object.assign(
			await database
				.updateTable('emails')
				.set(rest)
				.$if('to' in changes, qb => qb.set('to', JSON.stringify(to)))
				.$if('cc' in changes, qb => qb.set('cc', JSON.stringify(cc)))
				.$if('bcc' in changes, qb => qb.set('bcc', JSON.stringify(bcc)))
				.$if('text' in changes, qb => qb.set('snippet', makeSnippet(changes.text)))
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update email')),
			{ attachments: email.attachments }
		);
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'email/:id'> {
		const email = await authEmail(request, id);

		// deleting moves to trash; deleting from trash (or drafts) is permanent
		if (email.folder != 'trash' && email.folder != 'drafts') {
			const row = await database
				.updateTable('emails')
				.set('folder', 'trash')
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not delete email'));
			return Object.assign(row, { attachments: email.attachments });
		}

		const row = await database
			.deleteFrom('emails')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete email'));
		return Object.assign(row, { attachments: email.attachments });
	},
});

addRoute({
	path: '/api/email/:id/thread',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'email/:id/thread'> {
		const email = await authEmail(request, id);

		return await database
			.selectFrom('emails')
			.selectAll()
			.select(withAttachments)
			.where('userId', '=', email.userId)
			.where('threadId', '=', email.threadId)
			.orderBy('date', 'asc')
			.execute()
			.catch(withError('Could not get thread'));
	},
});

addRoute({
	path: '/api/email/:id/attachments/:attachmentId',
	params: { id: z.uuid(), attachmentId: z.uuid() },
	async GET(request, { id, attachmentId }): Promise<Response> {
		await authEmail(request, id);

		const attachment = await database
			.selectFrom('email_attachments')
			.selectAll()
			.where('id', '=', attachmentId)
			.where('emailId', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Attachment does not exist', 404));

		return new Response(new Uint8Array(attachment.content), {
			headers: {
				'Content-Type': attachment.contentType,
				'Content-Length': attachment.size.toString(),
				'Content-Disposition': `attachment; filename="${attachment.filename.replaceAll('"', '')}"`,
			},
		});
	},
});
