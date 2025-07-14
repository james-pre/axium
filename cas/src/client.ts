import { fetchAPI, token } from '@axium/client/requests';
import type { CASMetadata, CASUpdate, UserCASInfo } from './common.js';

export async function uploadItem(file: File): Promise<CASMetadata> {
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

	const response = await fetch('/raw/cas/upload', init);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: any = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error(json.message);

	json.lastModified = new Date(json.lastModified);

	return json;
}

export async function getItemMetadata(fileId: string): Promise<CASMetadata> {
	const result = await fetchAPI('GET', 'cas/item/:id', undefined, fileId);
	result.lastModified = new Date(result.lastModified);
	return result;
}

export async function downloadItem(fileId: string): Promise<Blob> {
	const response = await fetch('/raw/cas/' + fileId, {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download item: ' + response.statusText);

	return await response.blob();
}

export async function updateItem(fileId: string, metadata: CASUpdate): Promise<CASMetadata> {
	return fetchAPI('PATCH', 'cas/item/:id', metadata, fileId);
}

export async function deleteItem(fileId: string): Promise<CASMetadata> {
	return fetchAPI('DELETE', 'cas/item/:id', undefined, fileId);
}

export async function getUserCAS(userId: string): Promise<UserCASInfo> {
	const result = await fetchAPI('GET', 'users/:id/cas', undefined, userId);
	for (const item of result.items) {
		item.lastModified = new Date(item.lastModified);
	}
	return result;
}
