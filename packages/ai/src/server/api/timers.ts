import type { AsyncResult } from '@axium/core/api';
import { checkAuthForUser } from '@axium/server/auth';
import { parseBody } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import * as ai from '../../common.js';
import { cancel, list, start } from '../timers.js';

addRoute({
	path: '/api/users/:id/ai/timers',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/ai/timers'> {
		await checkAuthForUser(request, userId);
		return await list(userId);
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/ai/timers'> {
		const init = await parseBody(request, ai.TimerInit);
		await checkAuthForUser(request, userId);
		return await start(userId, init);
	},
});

addRoute({
	path: '/api/users/:id/ai/timers/:timer',
	params: { id: z.uuid(), timer: z.uuid() },
	async DELETE(request, { id: userId, timer: id }): AsyncResult<'DELETE', 'users/:id/ai/timers/:timer'> {
		await checkAuthForUser(request, userId);
		return await cancel(userId, id);
	},
});
