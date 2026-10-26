import type { AsyncResult, Result } from '@axium/core/api';
import { PushSubscriptionInit } from '@axium/core/notifications';
import { requireSession } from '../auth.js';
import { database } from '../db/index.js';
import { publicKey } from '../notifications.js';
import { parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/api/push',
	GET(): Result<'GET', 'push'> {
		return { publicKey: publicKey() };
	},
});

addRoute({
	path: '/api/session/push',
	async PUT(request): AsyncResult<'PUT', 'session/push'> {
		const { endpoint, keys } = await parseBody(request, PushSubscriptionInit);
		const { id: sessionId, userId } = await requireSession(request);

		await database
			.insertInto('push_subscriptions')
			.values({ endpoint, ...keys, userId, sessionId })
			.onConflict(oc => oc.column('endpoint').doUpdateSet({ ...keys, userId, sessionId }))
			.execute()
			.catch(withError('Could not save push subscription'));

		return {};
	},
	async DELETE(request): AsyncResult<'DELETE', 'session/push'> {
		const { endpoint } = await parseBody(request, PushSubscriptionInit.pick({ endpoint: true }));
		const { userId } = await requireSession(request);

		await database
			.deleteFrom('push_subscriptions')
			.where('endpoint', '=', endpoint)
			.where('userId', '=', userId)
			.execute()
			.catch(withError('Could not remove push subscription'));

		return {};
	},
});
