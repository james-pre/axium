import * as z from 'zod';
import { addRoute } from '../routes.js';
import type { Result } from '@axium/core/api';
import type { Schema } from '../database.js';
import { parseBody, withError } from '../requests.js';
import { createEntry } from '../acl.js';

addRoute({
	path: '/api/acl/:itemType/:itemId',
	params: {
		itemType: z.string(),
		itemId: z.uuid(),
	},
	async PUT(event): Result<'PUT', 'acl/:itemType/:itemId'> {
		const type = event.params.itemType as keyof Schema;
		const itemId = event.params.itemId!;

		const data = await parseBody(
			event,
			z.object({
				userId: z.uuid(),
				permission: z.number().int().min(0).max(5),
			})
		);

		const share = await createEntry(type, { ...data, itemId }).catch(withError('Failed to create access control'));

		return share;
	},
});
