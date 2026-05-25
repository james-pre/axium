import type { AsyncResult } from '@axium/core';
import { SyncOptions } from '@axium/core';
import { requireSession } from '../auth.js';
import { parseSearch } from '../requests.js';
import { addRoute } from '../routes.js';
import * as sync from '../sync.js';

addRoute({
	path: '/api/sync',
	async GET(req): AsyncResult<'GET', 'sync'> {
		const options = parseSearch(req, SyncOptions);

		const session = await requireSession(req);

		const events = await sync.getEvents(session.user, options);

		return events.length ? sync.computeDiff(events) : { deleted: [], created: [], updated: [], index: await sync.getCurrentIndex() };
	},
});

addRoute({
	path: '/api/sync/init',
	async GET(req): AsyncResult<'GET', 'sync/init'> {
		const session = await requireSession(req);

		const [objects, index] = await Promise.all([sync.getInit(session.user), sync.getCurrentIndex()]);

		return { objects, index };
	},
});
