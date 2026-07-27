import { fetchAPI, origin, prefix, token } from '@axium/client/requests';
import { uploadChunked, type ProgressHandler } from '@axium/client/uploads';
import { pick } from 'utilium';
import { prettifyError } from 'zod';
import type { GetItemOptions, StorageItemUpdate, UploadInitResult, UserStorage, UserStorageInfo, UserStorageOptions } from '../common.js';
import { StorageItemMetadata } from '../common.js';
import '../polyfills.js';

function rawStorage(suffix?: string): string | URL {
	const raw = '/raw/storage' + (suffix ? '/' + suffix : '');
	if (prefix[0] == '/') return origin + raw;
	const url = new URL(prefix);
	url.pathname = raw;
	return url;
}

async function _upload(
	upload: UploadInitResult,
	stream: ReadableStream<Uint8Array<ArrayBuffer>>,
	itemSize: number,
	onProgress?: ProgressHandler,
	signal?: AbortSignal
): Promise<StorageItemMetadata> {
	if (upload.status == 'created') return upload.item;

	const result = await uploadChunked({
		endpoint: rawStorage('upload'),
		token: upload.token,
		stream,
		itemSize,
		maxTransferSize: upload.max_transfer_size,
		onProgress,
		signal,
	});

	try {
		return StorageItemMetadata.parse(result);
	} catch (e: any) {
		throw prettifyError(e);
	}
}

export async function createDirectory(name: string, parentId?: string): Promise<StorageItemMetadata> {
	const upload = await fetchAPI('PUT', 'storage', { name, parentId, type: 'inode/directory', size: 0, hash: null });

	if (upload.status != 'created') throw new Error('Bug! Creating a directory resulted in an `accepted` status');

	return upload.item;
}

export interface CreateItemInit {
	onProgress?: ProgressHandler;
	parentId?: string;
	name: string;
	size: number;
	type: string;
	signal?: AbortSignal;
}

export async function createItem(stream: ReadableStream<Uint8Array<ArrayBuffer>>, init: CreateItemInit): Promise<StorageItemMetadata> {
	init.onProgress?.(0, init.size);

	if (!init.name) throw 'item name is required';

	const upload = await fetchAPI('PUT', 'storage', { ...init, hash: null });

	return await _upload(upload, stream, init.size, init.onProgress, init.signal);
}

export async function createItemFromFile(file: File, init: Partial<CreateItemInit>): Promise<StorageItemMetadata> {
	return await createItem(file.stream(), { ...pick(file, 'name', 'size', 'type'), ...init });
}

export async function updateItem(
	fileId: string,
	newSize: number | bigint,
	stream: ReadableStream<Uint8Array<ArrayBuffer>>,
	onProgress?: ProgressHandler,
	signal?: AbortSignal
): Promise<StorageItemMetadata> {
	const upload = await fetchAPI('POST', 'storage/item/:id', newSize, fileId);
	return await _upload(upload, stream, Number(newSize), onProgress, signal);
}

export async function getItemMetadata(fileId: string, options: GetItemOptions = {}): Promise<StorageItemMetadata> {
	return await fetchAPI('GET', 'storage/item/:id', options, fileId);
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

export async function downloadItemStream(fileId: string): Promise<ReadableStream<Uint8Array>> {
	const response = await fetch(rawStorage(fileId), {
		headers: token ? { Authorization: 'Bearer ' + token } : {},
	});

	if (!response.ok) throw new Error('Failed to download files: ' + response.statusText);
	if (!response.body) throw new Error('Failed to download files: No body');
	return response.body;
}

export async function updateItemMetadata(fileId: string, metadata: StorageItemUpdate): Promise<StorageItemMetadata> {
	return await fetchAPI('PATCH', 'storage/item/:id', metadata, fileId);
}

export async function deleteItem(fileId: string): Promise<StorageItemMetadata> {
	return await fetchAPI('DELETE', 'storage/item/:id', undefined, fileId);
}

export async function getUserStorage(userId: string, options: UserStorageOptions = {}): Promise<UserStorage> {
	return await fetchAPI('GET', 'users/:id/storage', options, userId);
}

export async function getUserUsage(userId: string): Promise<UserStorage> {
	return await fetchAPI('GET', 'users/:id/storage/usage', {}, userId);
}

export async function getUserStats(userId: string): Promise<UserStorageInfo> {
	return await fetchAPI('OPTIONS', 'users/:id/storage', undefined, userId);
}

export async function getUserTrash(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/trash', undefined, userId);
}

export async function clearUserTrash(userId: string): Promise<number> {
	return await fetchAPI('DELETE', 'users/:id/storage/trash', undefined, userId);
}

export async function itemsSharedWith(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/shared', undefined, userId);
}

export async function getUserStorageRoot(userId: string): Promise<StorageItemMetadata[]> {
	return await fetchAPI('GET', 'users/:id/storage/root', undefined, userId);
}
