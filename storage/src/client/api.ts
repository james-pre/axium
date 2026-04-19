import { fetchAPI, origin, prefix, token } from '@axium/client/requests';
import { pick } from 'utilium';
import { prettifyError } from 'zod';
import type { GetItemOptions, StorageItemUpdate, UploadInitResult, UserStorage, UserStorageInfo, UserStorageOptions } from '../common.js';
import { StorageItemMetadata } from '../common.js';
import '../polyfills.js';
import { warnOnce } from 'ioium';

function rawStorage(suffix?: string): string | URL {
	const raw = origin + '/raw/storage' + (suffix ? '/' + suffix : '');
	if (prefix[0] == '/') return raw;
	const url = new URL(prefix);
	url.pathname = raw;
	return url;
}

function handleFetchFailed(e: unknown): never {
	if (!(e instanceof Error) || e.message != 'fetch failed') throw e;
	throw 'fetch failed: ' + String(e.cause);
}

async function handleError(response: Response): Promise<never> {
	if (response.headers.get('Content-Type')?.trim() != 'application/json') throw await response.text();
	const json = await response.json();
	throw json.message;
}

async function handleResponse(response: Response | undefined) {
	if (!response) throw new Error('BUG: No response');

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) await handleError(response);

	try {
		return StorageItemMetadata.parse(json);
	} catch (e: any) {
		throw prettifyError(e);
	}
}

type ProgressHandler = (this: void, uploaded: number, total: number) => void;

async function _upload(
	upload: UploadInitResult,
	stream: ReadableStream<Uint8Array<ArrayBuffer>>,
	itemSize: number,
	onProgress?: ProgressHandler
): Promise<StorageItemMetadata> {
	if (upload.status == 'created') return upload.item;

	const targetChunkSize = upload.max_transfer_size * 1_000_000;

	let response: Response | undefined;
	const reader = stream.getReader();
	let buffer = new Uint8Array(0);

	for (let offset = 0; offset < itemSize; offset += targetChunkSize) {
		const chunkSize = Math.min(targetChunkSize, itemSize - offset);
		let bytesReadForChunk = 0;

		const headers: HeadersInit & object = {
			'x-upload': upload.token,
			'x-offset': offset.toString(),
			'x-chunk-size': chunkSize.toString(),
			'content-length': chunkSize.toString(),
			'content-type': 'application/octet-stream',
		};

		if (token) headers.authorization = 'Bearer ' + token;

		let body: BodyInit = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (bytesReadForChunk >= chunkSize) {
					controller.close();
					return;
				}

				if (!buffer.length) {
					const { done, value } = await reader.read();
					if (done) {
						controller.close();
						return;
					}
					buffer = value;
				}

				const take = Math.min(buffer.length, chunkSize - bytesReadForChunk);
				const chunk = buffer.subarray(0, take);
				buffer = buffer.subarray(take);

				bytesReadForChunk += take;
				controller.enqueue(chunk);

				onProgress?.(offset + bytesReadForChunk, itemSize);
			},
		});
		let init: object = { duplex: 'half' };

		/**
		 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=1387483
		 */
		if (globalThis.navigator?.userAgent?.toLowerCase().includes('firefox')) {
			await body.cancel();
			init = {};
			warnOnce('Using a workaround for uploading on Firefox [https://bugzilla.mozilla.org/show_bug.cgi?id=1387483]');

			const chunkData = new Uint8Array(chunkSize);
			let bytesReadForChunk = 0;

			if (buffer.length > 0) {
				const take = Math.min(buffer.length, chunkSize);
				chunkData.set(buffer.subarray(0, take), 0);
				buffer = buffer.subarray(take);
				bytesReadForChunk += take;
			}

			while (bytesReadForChunk < chunkSize) {
				const { done, value } = await reader.read();
				if (done) break;

				const take = Math.min(value.length, chunkSize - bytesReadForChunk);
				chunkData.set(value.subarray(0, take), bytesReadForChunk);
				buffer = value.subarray(take);
				bytesReadForChunk += take;
			}

			body = chunkData.subarray(0, bytesReadForChunk);
			onProgress?.(offset + bytesReadForChunk, itemSize);
		}

		response = await fetch(rawStorage('chunk'), {
			method: 'POST',
			headers,
			body,
			...init,
		}).catch(handleFetchFailed);

		if (!response.ok) await handleError(response);

		if (offset + chunkSize != itemSize && response.status != 204) console.warn('Unexpected end of upload before last chunk');
	}

	return await handleResponse(response);
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
}

export async function createItem(stream: ReadableStream<Uint8Array<ArrayBuffer>>, init: CreateItemInit): Promise<StorageItemMetadata> {
	init.onProgress?.(0, init.size);

	if (!init.name) throw 'item name is required';

	const upload = await fetchAPI('PUT', 'storage', { ...init, hash: null });

	return await _upload(upload, stream, init.size, init.onProgress);
}

export async function createItemFromFile(file: File, init: Partial<CreateItemInit>): Promise<StorageItemMetadata> {
	return await createItem(file.stream(), { ...pick(file, 'name', 'size', 'type'), ...init });
}

export async function updateItem(
	fileId: string,
	newSize: number | bigint,
	stream: ReadableStream<Uint8Array<ArrayBuffer>>,
	onProgress?: ProgressHandler
): Promise<StorageItemMetadata> {
	const upload = await fetchAPI('POST', 'storage/item/:id', newSize, fileId);
	return await _upload(upload, stream, Number(newSize), onProgress);
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

export async function getUserStats(userId: string): Promise<UserStorageInfo> {
	return await fetchAPI('OPTIONS', 'users/:id/storage', undefined, userId);
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
