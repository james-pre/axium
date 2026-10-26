import { AccessControlUpdate, AccessTarget } from '@axium/core';
import { fromTarget } from '@axium/core/access';
import type { AsyncResult } from '@axium/core/api';
import * as z from 'zod';
import * as acl from '../acl.js';
import { authRequestForItem } from '../auth.js';
import { notify } from '../notifications.js';
import { error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

function getTable(itemType: string): acl.TableName {
	const tables = acl.listTables();
	if (!(itemType in tables)) error(400, 'Invalid item type: ' + itemType);
	return tables[itemType];
}

addRoute({
	path: '/api/acl/:itemType/:itemId',
	params: {
		itemType: z.string(),
		itemId: z.uuid(),
	},
	async GET(request, { itemType, itemId }): AsyncResult<'GET', 'acl/:itemType/:itemId'> {
		const table = getTable(itemType);

		return await acl.get(table, itemId).catch(withError('Failed to get access controls'));
	},
	async PATCH(request, { itemType, itemId }): AsyncResult<'PATCH', 'acl/:itemType/:itemId'> {
		const table = getTable(itemType);
		const { target, permissions } = await parseBody(request, AccessControlUpdate);

		await authRequestForItem(request, itemType as acl.TargetName, itemId, { manage: true });

		return await acl.update(table, itemId, target, permissions);
	},
	async PUT(request, { itemType, itemId }): AsyncResult<'PUT', 'acl/:itemType/:itemId'> {
		const table = getTable(itemType);
		const target = await parseBody(request, AccessTarget);

		const { item, user } = await authRequestForItem(request, itemType as acl.TargetName, itemId, { manage: true });

		const control = await acl.add(table, itemId, target);

		const { userId } = fromTarget(target);
		if (userId && user && userId != user.id) {
			const link = acl.linkTo(itemType as acl.TargetName, item);
			void notify(userId, {
				title: link ? `${user.name} shared ${link.name} with you` : `${user.name} shared something with you`,
				url: link?.url,
				tag: `share:${itemType}:${itemId}`,
			});
		}

		return control;
	},
	async DELETE(request, { itemType, itemId }): AsyncResult<'DELETE', 'acl/:itemType/:itemId'> {
		const table = getTable(itemType);
		const target = await parseBody(request, AccessTarget);

		await authRequestForItem(request, itemType as acl.TargetName, itemId, { manage: true });
		return await acl.remove(table, itemId, target);
	},
});
