import { fetchAPI, token } from '@axium/client/requests';
import type { StorageItemMetadata, StorageItemUpdate, UserFilesInfo } from './common.js';
import type { ItemSelection } from './selection.js';

export async function uploadItem(file: File): Promise<StorageItemMetadata> {
	const init = {
		method: 'PUT',
		headers: {
			'Content-Type': file.type,
			'Content-Length': file.size.toString(),
			'X-Name': file.name,
		} as Record<string, string>,
		body: file,
	};

	if (token) {
		init.headers.Authorization = 'Bearer ' + token;
	}

	const response = await fetch('/raw/storage', init);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: StorageItemMetadata = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error((json as any).message);

	json.modifiedAt = new Date(json.modifiedAt);

	return json;
}

export async function getItemMetadata(fileId: string): Promise<StorageItemMetadata> {
	const result = await fetchAPI('GET', 'storage/item/:id', undefined, fileId);
	result.modifiedAt = new Date(result.modifiedAt);
	return result;
}

export async function getDirectoryMetadata(parentId: string): Promise<StorageItemMetadata[]> {
	const result = await fetchAPI('GET', 'storage/directory/:id', undefined, parentId);
	for (const item of result) {
		item.modifiedAt = new Date(item.modifiedAt);
	}
	return result;
}

export async function downloadItem(fileId: string): Promise<Blob> {
	const response = await fetch('/raw/storage/' + fileId, {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download files: ' + response.statusText);

	return await response.blob();
}

export async function updateItem(fileId: string, metadata: StorageItemUpdate): Promise<StorageItemMetadata> {
	return fetchAPI('PATCH', 'storage/item/:id', metadata, fileId);
}

export async function deleteItem(fileId: string): Promise<StorageItemMetadata> {
	return fetchAPI('DELETE', 'storage/item/:id', undefined, fileId);
}

export async function getUserFiles(userId: string): Promise<UserFilesInfo> {
	const result = await fetchAPI('GET', 'users/:id/storage', undefined, userId);
	for (const item of result.items) {
		item.modifiedAt = new Date(item.modifiedAt);
	}
	return result;
}

export interface _Sidebar {
	selection: ItemSelection<string, StorageItemMetadata>;
	items: StorageItemMetadata[];
	getDirectory(id: string, assignTo?: StorageItemMetadata[]): Promise<StorageItemMetadata[]>;
}
