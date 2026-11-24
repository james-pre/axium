import { getConfig } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import { UploadInit } from '@axium/core/uploads';
import { checkAuthForUser, requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { contentDispositionFor, error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { UploadManager } from '@axium/server/uploads';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import * as z from 'zod';
import type * as ai from '../../common.js';
import * as sandbox from '../sandbox.js';

interface Target {
	userId: string;
	conversationId: string;
	temporary: boolean;
}

/** A saved conversation the request may use, or else the requesting user's temporary conversation with that ID */
async function authTarget(request: Request, conversationId: string): Promise<Target> {
	const saved = await database.selectFrom('ai_conversations').select('userId').where('id', '=', conversationId).executeTakeFirst();
	if (saved) {
		await checkAuthForUser(request, saved.userId);
		return { userId: saved.userId, conversationId, temporary: false };
	}

	const { userId } = await requireSession(request);
	return { userId, conversationId, temporary: true };
}

function requireSandbox({ userId, conversationId, temporary }: Target): sandbox.ServerSandbox {
	return sandbox.forConversation(userId, conversationId, { temporary, network: 'none' }) ?? error(503, 'The sandbox is not available');
}

/** Where attachments go in the sandbox */
const uploadsFolder = 'uploads';

/** A relative path with only safe segments */
function safePath(path: string): string {
	const segments = path
		.split('/')
		.map(segment =>
			segment
				.replace(/[\p{Cc}\\]/gu, '_')
				.trim()
				.slice(0, 255)
		)
		.filter(segment => segment && segment != '.' && segment != '..');
	return segments.length ? segments.join('/') : 'file';
}

const uploads = new UploadManager<UploadInit, Target>(() => ({
	temp_dir: join(getConfig('@axium/ai').data_dir, 'sandbox', 'uploads'),
	timeout: 10,
}));

uploads.addEndpoint('/raw/ai/attachments', async upload => {
	const relative = safePath(upload.init.name);
	const name = relative.split('/').at(-1)!;
	const path = `${uploadsFolder}/${relative}`;
	await requireSandbox(upload.data)
		.write(path, Readable.toWeb(createReadStream(upload.file)) as ReadableStream<Uint8Array>)
		.catch(withError('Could not add the file to the sandbox', 502));

	return Response.json({ name, path, size: Number(upload.init.size) } satisfies ai.Attachment);
});

addRoute({
	path: '/api/ai/sandbox',
	async GET(request): AsyncResult<'GET', 'ai/sandbox'> {
		await requireSession(request);
		return { available: sandbox.isAvailable() };
	},
});

addRoute({
	path: '/api/ai/sandbox/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'ai/sandbox/:id'> {
		const target = await authTarget(request, id);
		return await requireSandbox(target).list(request.signal).catch(withError('Could not list the files', 502));
	},
});

addRoute({
	path: '/api/ai/sandbox/:id/attachments',
	params: { id: z.uuid() },
	async PUT(request, { id }): AsyncResult<'PUT', 'ai/sandbox/:id/attachments'> {
		const init = await parseBody(request, UploadInit);
		const target = await authTarget(request, id);
		requireSandbox(target);

		if (init.size > BigInt(getConfig('@axium/ai').sandbox.disk) * 1024n * 1024n) error(413, 'The file is larger than the sandbox');

		const session = await requireSession(request);
		return { token: uploads.start(init, session, target), max_transfer_size: getConfig('@axium/ai').sandbox.max_transfer_size };
	},
});

addRoute({
	path: '/raw/ai/sandbox/:id',
	params: { id: z.uuid() },
	async GET(request, { id }) {
		const path = new URL(request.url).searchParams.get('path');
		if (!path) error(400, 'Missing path');

		const target = await authTarget(request, id);
		const stream = await requireSandbox(target).open(path, request.signal).catch(withError('Could not read the file', 502));

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': contentDispositionFor(path.split('/').at(-1) || 'file'),
			},
		});
	},
});
