import { AccessMap } from '@axium/core/access';
import type { AsyncResult } from '@axium/core/api';
import * as z from 'zod';
import * as acl from '../acl.js';
import type { Schema } from '../database.js';
import { parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/api/acl/:itemType/:itemId',
	params: {
		itemType: z.string(),
		itemId: z.uuid(),
	},
	async GET(request, { itemType, itemId }): AsyncResult<'GET', 'acl/:itemType/:itemId'> {
		return await acl.get(itemType as keyof Schema, itemId).catch(withError('Failed to get access controls'));
	},
	async POST(request, { itemType, itemId }): AsyncResult<'POST', 'acl/:itemType/:itemId'> {
		const data = await parseBody(request, AccessMap);

		return await acl.set(itemType as keyof Schema, itemId, data).catch(withError('Failed to set access controls'));
	},
});
