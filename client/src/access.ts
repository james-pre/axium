import type { AccessControl, AccessMap, Permission } from '@axium/core';
import { fetchAPI } from './requests.js';

export async function setACL(itemType: string, itemId: string, data: AccessMap): Promise<AccessControl[]> {
	if ('public' in data) data.public = parseInt(data.public.toString()) as Permission;
	return await fetchAPI('POST', 'acl/:itemType/:itemId', data, itemType, itemId);
}

export async function getACL(itemType: string, itemId: string): Promise<AccessControl[]> {
	return await fetchAPI('GET', 'acl/:itemType/:itemId', {}, itemType, itemId);
}
