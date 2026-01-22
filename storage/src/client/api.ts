import { fetchAPI, prefix, token } from '@axium/client/requests';
import type { StorageItemMetadata, StorageItemUpdate, UserStorage, UserStorageInfo } from '../common.js';

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

function rawStorage(fileId?: string): string | URL {
	const raw = '/raw/storage' + (fileId ? '/' + fileId : '');
	if (prefix[0] == '/') return raw;
	const url = new URL(prefix);
	url.pathname = raw;
	return url;
}

export interface UploadOptions {
	parentId?: string;
	name?: string;
}

export async function uploadItem(file: Blob | File, opt: UploadOptions = {}): Promise<StorageItemMetadata> {
	const headers: Record<string, string> = {};
	if (opt.parentId) headers['x-parent'] = opt.parentId;
	if (opt.name) headers['x-name'] = opt.name;
	return await _upload('PUT', rawStorage(), file, headers);
}

export async function updateItem(fileId: string, data: Blob): Promise<StorageItemMetadata> {
	return await _upload('POST', rawStorage(fileId), data);
}

export async function getItemMetadata(fileId: string): Promise<StorageItemMetadata> {
	return await fetchAPI('GET', 'storage/item/:id', undefined, fileId);
}

/** Gets the metadata for all items in a directory. */
export async function getDirectoryMetadata(parentId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'storage/directory/:id', undefined, parentId);
}

export async function downloadItem(fileId: string): Promise<Blob> {
	const response = await fetch(rawStorage(fileId), {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download files: ' + response.statusText);

	return await response.blob();
}

export async function updateItemMetadata(fileId: string, metadata: StorageItemUpdate): Promise<StorageItemMetadata> {
	return await fetchAPI('PATCH', 'storage/item/:id', metadata, fileId);
}

export async function deleteItem(fileId: string): Promise<StorageItemMetadata> {
	return await fetchAPI('DELETE', 'storage/item/:id', undefined, fileId);
}

export async function getUserStorage(userId: string): Promise<UserStorage> {
	return await fetchAPI('GET', 'users/:id/storage', undefined, userId);
}

export async function getUserStats(userId: string): Promise<UserStorageInfo> {
	const result = await fetchAPI('OPTIONS', 'users/:id/storage', undefined, userId);
	result.lastModified = new Date(result.lastModified);
	if (result.lastTrashed) result.lastTrashed = new Date(result.lastTrashed);
	return result;
}

export async function getUserTrash(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/trash', undefined, userId);
}

export async function itemsSharedWith(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/shared', undefined, userId);
}

export async function getUserStorageRoot(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/root', undefined, userId);
}
