import { AccessMap } from '@axium/core/access';
import type { AsyncResult } from '@axium/core/api';
import * as z from 'zod';
import * as acl from '../acl.js';
import { error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';
import { checkAuthForItem } from '../auth.js';
import type { Schema } from '../database.js';

addRoute({
	path: '/api/acl/:itemType/:itemId',
	params: {
		itemType: z.string(),
		itemId: z.uuid(),
	},
	async GET(request, { itemType, itemId }): AsyncResult<'GET', 'acl/:itemType/:itemId'> {
		const tables = acl.listTables();
		if (!(itemType in tables)) error(400, 'Invalid item type: ' + itemType);

		return await acl.get(tables[itemType], itemId).catch(withError('Failed to get access controls'));
	},
	async POST(request, { itemType, itemId }): AsyncResult<'POST', 'acl/:itemType/:itemId'> {
		const data = await parseBody(request, AccessMap);

		const tables = acl.listTables();
		if (!(itemType in tables)) error(400, 'Invalid item type: ' + itemType);

		await checkAuthForItem(request, itemType as keyof Schema, itemId, { manage: true });

		return await acl.set(tables[itemType], itemId, data);
	},
});
