import { fetchAPI, token } from '@axium/client/requests';
import type { CASMetadata, CASUpdate } from './common.js';

export async function uploadItem(file: File): Promise<CASMetadata> {
	const init = {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Length': file.size.toString(),
			'X-File-Name': file.name,
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

	return json;
}

export async function getItemMetadata(fileId: string): Promise<CASMetadata> {
	return fetchAPI('GET', 'cas/item/:id', undefined, fileId);
}

export async function downloadItem(fileId: string): Promise<Uint8Array> {
	const response = await fetch('/raw/cas/' + fileId, {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download item: ' + response.statusText);

	const data = await response.arrayBuffer();
	return new Uint8Array(data);
}

export async function updateItem(fileId: string, metadata: CASUpdate): Promise<CASMetadata> {
	return fetchAPI('PATCH', 'cas/item/:id', metadata, fileId);
}

export async function deleteItem(fileId: string): Promise<CASMetadata> {
	return fetchAPI('DELETE', 'cas/item/:id', undefined, fileId);
}

export async function listUserItems(userId: string): Promise<CASMetadata[]> {
	return fetchAPI('GET', 'users/:id/cas_items', undefined, userId);
}
