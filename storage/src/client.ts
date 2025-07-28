import { fetchAPI, token } from '@axium/client/requests';
import type { StorageItemMetadata, StorageItemUpdate, UserFilesInfo } from './common.js';
import type { ItemSelection } from './selection.js';

async function _upload(
	method: 'PUT' | 'POST',
	url: string | URL,
	data: Blob | File,
	extraHeaders: Record<string, string> = {}
): Promise<StorageItemMetadata> {
	const init = {
		method,
		headers: {
			'Content-Type': data.type,
			'Content-Length': data.size.toString(),
			...extraHeaders,
		} as Record<string, string>,
		body: data,
	} satisfies RequestInit;

	if (data instanceof File) init.headers['X-Name'] = data.name;
	if (token) init.headers.Authorization = 'Bearer ' + token;

	const response = await fetch(url, init);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: StorageItemMetadata = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error((json as any).message);

	json.modifiedAt = new Date(json.modifiedAt);

	return json;
}

export function parseItem(result: StorageItemMetadata): StorageItemMetadata {
	result.createdAt = new Date(result.createdAt);
	result.modifiedAt = new Date(result.modifiedAt);
	if (result.trashedAt) result.trashedAt = new Date(result.trashedAt);
	return result;
}

export interface UploadOptions {
	parentId?: string;
	name?: string;
}

export async function uploadItem(file: File, opt: UploadOptions): Promise<StorageItemMetadata> {
	const headers: Record<string, string> = {};
	if (opt.parentId) headers['x-parent'] = opt.parentId;
	if (opt.name) headers['x-name'] = opt.name;
	return parseItem(await _upload('PUT', '/raw/storage', file, headers));
}

export async function updateItem(fileId: string, data: Blob): Promise<StorageItemMetadata> {
	return parseItem(await _upload('POST', '/raw/storage/' + fileId, data));
}

export async function getItemMetadata(fileId: string): Promise<StorageItemMetadata> {
	const result = await fetchAPI('GET', 'storage/item/:id', undefined, fileId);
	return parseItem(result);
}

export async function getDirectoryMetadata(parentId: string): Promise<StorageItemMetadata[]> {
	const result = await fetchAPI('GET', 'storage/directory/:id', undefined, parentId);
	for (const item of result) parseItem(item);
	return result;
}

export async function downloadItem(fileId: string): Promise<Blob> {
	const response = await fetch('/raw/storage/' + fileId, {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download files: ' + response.statusText);

	return await response.blob();
}

export async function updateItemMetadata(fileId: string, metadata: StorageItemUpdate): Promise<StorageItemMetadata> {
	const result = await fetchAPI('PATCH', 'storage/item/:id', metadata, fileId);
	return parseItem(result);
}

export async function deleteItem(fileId: string): Promise<StorageItemMetadata> {
	const result = await fetchAPI('DELETE', 'storage/item/:id', undefined, fileId);
	return parseItem(result);
}

export async function getUserFiles(userId: string): Promise<UserFilesInfo> {
	const result = await fetchAPI('GET', 'users/:id/storage', undefined, userId);
	for (const item of result.items) parseItem(item);
	return result;
}

export interface _Sidebar {
	selection: ItemSelection<string, StorageItemMetadata>;
	items: StorageItemMetadata[];
	getDirectory(id: string, assignTo?: StorageItemMetadata[]): Promise<StorageItemMetadata[]>;
}
