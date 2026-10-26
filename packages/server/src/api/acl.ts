import { AccessControlUpdate, AccessTarget } from '@axium/core';
import { fromTarget } from '@axium/core/access';
import { getAccessControlConfig } from '@axium/core/plugins';
import type { AsyncResult } from '@axium/core/api';
import * as z from 'zod';
import * as acl from '../acl.js';
import { authRequestForItem } from '../auth.js';
import { notify } from '../notifications.js';
import { error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

function assertShareable(itemType: string): asserts itemType is acl.TargetName {
	if (!getAccessControlConfig(itemType)) error(400, 'Invalid item type: ' + itemType);
}

addRoute({
	path: '/api/acl/:itemType/:itemId',
	params: {
		itemType: z.string(),
		itemId: z.uuid(),
	},
	async GET(request, { itemType, itemId }): AsyncResult<'GET', 'acl/:itemType/:itemId'> {
		assertShareable(itemType);

		await authRequestForItem(request, itemType, itemId, {});

		return await acl.get(itemType, itemId).catch(withError('Failed to get access controls'));
	},
	async PATCH(request, { itemType, itemId }): AsyncResult<'PATCH', 'acl/:itemType/:itemId'> {
		assertShareable(itemType);
		const { target, permissions } = await parseBody(request, AccessControlUpdate);

		await authRequestForItem(request, itemType, itemId, { manage: true });

		return await acl.update(itemType, itemId, target, permissions).catch(withError('Failed to update access control', 400));
	},
	async PUT(request, { itemType, itemId }): AsyncResult<'PUT', 'acl/:itemType/:itemId'> {
		assertShareable(itemType);
		const target = await parseBody(request, AccessTarget);

		const { item, user } = await authRequestForItem(request, itemType, itemId, { manage: true });

		const control = await acl.add(itemType, itemId, target).catch(withError('Failed to add access control', 400));

		const { userId } = fromTarget(target);
		const link = acl.linkTo(itemType, item);
		if (link && userId && user && userId != user.id) {
			void notify(userId, {
				title: link.name ? `${user.name} shared ${link.name} with you` : `${user.name} shared something with you`,
				url: link.url,
				tag: `share:${itemType}:${itemId}`,
			});
		}

		return control;
	},
	async DELETE(request, { itemType, itemId }): AsyncResult<'DELETE', 'acl/:itemType/:itemId'> {
		assertShareable(itemType);
		const target = await parseBody(request, AccessTarget);

		await authRequestForItem(request, itemType, itemId, { manage: true });
		return await acl.remove(itemType, itemId, target);
	},
});
