import { Permission } from '@axium/core/access';
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
	async PUT(request, params): AsyncResult<'PUT', 'acl/:itemType/:itemId'> {
		const type = params.itemType as keyof Schema;
		const itemId = params.itemId!;

		const data = await parseBody(request, z.object({ userId: z.uuid(), permission: Permission }));

		const share = await acl.createEntry(type, { ...data, itemId }).catch(withError('Failed to create access control'));

		return share;
	},
});
