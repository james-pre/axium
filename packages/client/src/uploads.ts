import { warnOnce } from 'ioium';
import { token } from './requests.js';

function handleFetchFailed(e: unknown): never {
	if (!(e instanceof Error) || e.message != 'fetch failed') throw e;
	throw 'fetch failed: ' + String(e.cause);
}

async function handleError(response: Response): Promise<never> {
	if (response.headers.get('Content-Type')?.trim() != 'application/json') throw await response.text();
	const json = await response.json();
	throw json.message;
}

export type ProgressHandler = (this: void, uploaded: number, total: number) => void;

export interface UploadChunkedOptions {
	endpoint: string | URL;
	/** Upload token */
	token: string;
	stream: ReadableStream<Uint8Array<ArrayBuffer>>;
	itemSize: number;
	/** Maximum size of a request body in MiB */
	maxTransferSize: number;
	onProgress?: ProgressHandler;
	signal?: AbortSignal;
}

/**
 * Does a chunked upload to a given endpoint
 */
export async function uploadChunked<T>(options: UploadChunkedOptions): Promise<T> {
	const { endpoint, token: uploadToken, stream, itemSize, maxTransferSize, onProgress, signal } = options;

	signal?.addEventListener('abort', () => {
		void fetch(endpoint, {
			method: 'DELETE',
			headers: { 'x-upload': uploadToken },
		});
	});

	const targetChunkSize = maxTransferSize * 1_000_000;

	let response: Response | undefined;
	const reader = stream.getReader();
	let buffer = new Uint8Array(0);

	for (let offset = 0; offset < itemSize; offset += targetChunkSize) {
		signal?.throwIfAborted();

		const chunkSize = Math.min(targetChunkSize, itemSize - offset);
		let bytesReadForChunk = 0;

		const headers: HeadersInit & object = {
			'x-upload': uploadToken,
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

		/** @see https://bugzilla.mozilla.org/show_bug.cgi?id=1387483 */
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

		response = await fetch(endpoint, {
			method: 'POST',
			headers,
			body,
			signal,
			...init,
		}).catch(handleFetchFailed);

		if (!response.ok) await handleError(response);

		if (offset + chunkSize != itemSize && response.status != 204) console.warn('Unexpected end of upload before last chunk');
	}

	if (!response) throw new Error('BUG: No response');

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) await handleError(response);

	return json;
}
