import { fetchAPI, prefix, token } from '@axium/client/requests';
import { blake2b } from 'blakejs';
import { prettifyError } from 'zod';
import type { GetItemOptions, StorageItemUpdate, UserStorage, UserStorageInfo, UserStorageOptions } from '../common.js';
import { StorageItemMetadata } from '../common.js';
import '../polyfills.js';

const uploadConfig = {
	/**
	 * Requests below this amount in MB will be hashed client-side to avoid bandwidth usage.
	 * This is most useful when the client has plenty of compute but a poor network connection.
	 * For good connections, this isn't really useful since it takes longer than just uploading.
	 * Note that hashing takes a really long time client-side though.
	 */
	hashThreshold: 10,
	/**
	 * Set an upper limit for chunk size in MB, independent of `max_transfer_size`.
	 * Smaller chunks means better UX but more latency from RTT and more requests.
	 */
	uxChunkSize: 10,
};

function rawStorage(suffix?: string): string | URL {
	const raw = '/raw/storage' + (suffix ? '/' + suffix : '');
	if (prefix[0] == '/') return raw;
	const url = new URL(prefix);
	url.pathname = raw;
	return url;
}

declare global {
	interface NetworkInformation {
		readonly downlink: number;
		readonly downlinkMax?: number;
		readonly effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
		readonly rtt: number;
		readonly saveData: boolean;
		readonly type: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
	}

	interface Navigator {
		connection?: NetworkInformation;
	}
}

const conTypeToSpeed = {
	'slow-2g': 1,
	'2g': 4,
	'3g': 16,
	'4g': 64,
} satisfies Record<NetworkInformation['effectiveType'], number>;

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

export interface UploadOptions {
	parentId?: string;
	name?: string;
	onProgress?(this: void, uploaded: number, total: number): void;
}

export async function uploadItem(file: Blob | File, opt: UploadOptions = {}): Promise<StorageItemMetadata> {
	if (file instanceof File) opt.name ||= file.name;

	if (!opt.name) throw 'item name is required';

	const content = await file.bytes();

	/** For big files, it takes a *really* long time to compute the hash, so we just don't do it ahead of time and leave it up to the server. */
	const hash = content.length < uploadConfig.hashThreshold * 1_000_000 ? blake2b(content).toHex() : null;

	const upload = await fetchAPI('PUT', 'storage', {
		parentId: opt.parentId,
		name: opt.name,
		type: file.type,
		size: file.size,
		hash,
	});

	if (upload.status == 'created') return upload.item;

	const chunkSize =
		Math.min(
			upload.max_transfer_size,
			globalThis.navigator?.connection ? conTypeToSpeed[globalThis.navigator.connection.effectiveType] : uploadConfig.uxChunkSize
		) * 1_000_000;

	opt.onProgress?.(0, content.length);

	let response: Response | undefined;

	for (let offset = 0; offset < content.length; offset += chunkSize) {
		const size = Math.min(chunkSize, content.length - offset);
		response = await fetch(rawStorage('chunk'), {
			method: 'POST',
			headers: {
				'x-upload': upload.token,
				'x-offset': offset.toString(),
				'content-length': size.toString(),
				'content-type': 'application/octet-stream',
				authorization: 'Bearer ' + token,
			},
			body: content.slice(offset, offset + size),
		}).catch(handleFetchFailed);

		if (!response.ok) await handleError(response);

		opt.onProgress?.(offset + size, content.length);

		if (offset + size != content.length && response.status != 204) console.warn('Unexpected end of upload before last chunk');
	}

	return await handleResponse(response);
}

export interface UploadStreamOptions extends UploadOptions {
	name: string;
	size: number;
	type: string;
}

export async function uploadItemStream(
	stream: ReadableStream<Uint8Array<ArrayBuffer>>,
	opt: UploadStreamOptions
): Promise<StorageItemMetadata> {
	opt.onProgress?.(0, opt.size);

	const upload = await fetchAPI('PUT', 'storage', { ...opt, hash: null });

	if (upload.status == 'created') return upload.item;

	const chunkSize = upload.max_transfer_size * 1_000_000;

	let response: Response | undefined;
	const reader = stream.getReader();
	let buffer = new Uint8Array(0);

	for (let offset = 0; offset < opt.size; offset += chunkSize) {
		const size = Math.min(chunkSize, opt.size - offset);
		let bytesReadForChunk = 0;

		response = await fetch(rawStorage('chunk'), {
			method: 'POST',
			headers: {
				'x-upload': upload.token,
				'x-offset': offset.toString(),
				'content-length': size.toString(),
				'content-type': 'application/octet-stream',
				authorization: 'Bearer ' + token,
			},
			body: new ReadableStream<Uint8Array>({
				type: 'bytes',
				async pull(controller) {
					if (bytesReadForChunk >= size) {
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

					const take = Math.min(buffer.length, size - bytesReadForChunk);
					const chunk = buffer.subarray(0, take);
					buffer = buffer.subarray(take);

					bytesReadForChunk += take;
					controller.enqueue(chunk);

					opt.onProgress?.(offset + bytesReadForChunk, opt.size);
				},
			}),
			// @ts-expect-error 2769
			duplex: 'half',
		}).catch(handleFetchFailed);

		if (!response.ok) await handleError(response);

		if (offset + size != opt.size && response.status != 204) console.warn('Unexpected end of upload before last chunk');
	}

	return await handleResponse(response);
}

export async function updateItem(fileId: string, data: Blob): Promise<StorageItemMetadata> {
	const init = {
		method: 'POST',
		headers: {
			'Content-Type': data.type,
			'Content-Length': data.size.toString(),
		} as Record<string, string>,
		body: data,
	} satisfies RequestInit;

	if (data instanceof File) init.headers['X-Name'] = data.name;
	if (token) init.headers.Authorization = 'Bearer ' + token;

	const response = await fetch(rawStorage(fileId), init).catch(handleFetchFailed);

	return await handleResponse(response);
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
