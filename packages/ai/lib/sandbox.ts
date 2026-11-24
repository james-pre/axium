import * as ai from '@axium/ai/common';
import { fetchAPI, origin, prefix } from '@axium/client/requests';
import { uploadChunked, type ProgressHandler } from '@axium/client/uploads';

function raw(path: string): URL {
	if (prefix[0] == '/') return new URL('/raw/ai/' + path, origin);
	const url = new URL(prefix);
	url.pathname = '/raw/ai/' + path;
	return url;
}

/**
 * Uploads a file to a conversation's sandbox
 * @param path Relative to the attachments folder
 */
export async function attach(
	conversationId: string,
	file: File,
	path: string = file.name,
	onProgress?: ProgressHandler,
	signal?: AbortSignal
): Promise<ai.Attachment> {
	const upload = await fetchAPI('PUT', 'ai/sandbox/:id/attachments', { name: path, size: file.size, type: file.type }, conversationId);

	const result = await uploadChunked({
		endpoint: raw('attachments'),
		token: upload.token,
		stream: file.stream(),
		itemSize: file.size,
		maxTransferSize: upload.max_transfer_size,
		onProgress,
		signal,
	});

	return ai.Attachment.parse(result);
}

/** Where a file in a conversation's sandbox can be downloaded */
export function downloadURL(conversationId: string, path: string): string {
	const url = raw('sandbox/' + conversationId);
	url.searchParams.set('path', path);
	return url.href;
}
