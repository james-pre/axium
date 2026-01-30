import type { AccessControl, AccessTarget } from '@axium/core';
import { fetchAPI } from './requests.js';

export async function updateACL(
	itemType: string,
	itemId: string,
	target: AccessTarget,
	permissions: Partial<Record<string, any>>
): Promise<AccessControl> {
	return await fetchAPI('PATCH', 'acl/:itemType/:itemId', { target, permissions }, itemType, itemId);
}

export async function getACL(itemType: string, itemId: string): Promise<AccessControl[]> {
	return await fetchAPI('GET', 'acl/:itemType/:itemId', {}, itemType, itemId);
}

export async function addToACL(itemType: string, itemId: string, target: AccessTarget): Promise<AccessControl> {
	return await fetchAPI('PUT', 'acl/:itemType/:itemId', target, itemType, itemId);
}

export async function removeFromACL(itemType: string, itemId: string, target: AccessTarget): Promise<AccessControl> {
	return await fetchAPI('DELETE', 'acl/:itemType/:itemId', target, itemType, itemId);
}
