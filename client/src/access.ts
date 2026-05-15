import type { AccessControl, AccessTarget } from '@axium/core';
import * as cache from './cache.js';
import { fetchAPI } from './requests.js';

export async function updateACL(
	itemType: string,
	itemId: string,
	target: AccessTarget,
	permissions: Partial<Record<string, any>>
): Promise<AccessControl> {
	const result = await fetchAPI('PATCH', 'acl/:itemType/:itemId', { target, permissions }, itemType, itemId);
	cache.invalidate('acl', `${itemType}/${itemId}`);
	return result;
}

export async function getACL(itemType: string, itemId: string): Promise<AccessControl[]> {
	return await cache.use('acl', `${itemType}/${itemId}`, () => fetchAPI('GET', 'acl/:itemType/:itemId', {}, itemType, itemId));
}

export async function addToACL(itemType: string, itemId: string, target: AccessTarget): Promise<AccessControl> {
	const result = await fetchAPI('PUT', 'acl/:itemType/:itemId', target, itemType, itemId);
	cache.invalidate('acl', `${itemType}/${itemId}`);
	return result;
}

export async function removeFromACL(itemType: string, itemId: string, target: AccessTarget): Promise<AccessControl> {
	const result = await fetchAPI('DELETE', 'acl/:itemType/:itemId', target, itemType, itemId);
	cache.invalidate('acl', `${itemType}/${itemId}`);
	return result;
}
