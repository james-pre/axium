import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/gui';
import { setProgressCancel, toast } from '@axium/client/toast';
import * as io from 'ioium';
import { encodeUUID, type UUID } from 'utilium';
import { origin, text } from '@axium/client';
import { createDirectory, createItemFromFile, updateItemMetadata } from './api.js';

function shortURL(id: string): string {
	return new URL('/f/' + encodeUUID(id as UUID).toBase64({ alphabet: 'base64url', omitPadding: true }), location.origin).href;
}

export function copyShortURL(...ids: string[]): Promise<void> {
	return copy('text/plain', ids.map(shortURL).join(', '));
}

/**
 * Formats an item name
 */
export function formatItemName(item?: { name?: string | null } | null) {
	if (!item?.name) return text('storage.generic.no_name_in_dialog');
	return item.name.length > 23 ? item.name.slice(0, 20) + '...' : item.name;
}

export function _downloadItem(item?: StorageItemMetadata) {
	if (!item) throw text('storage.generic.no_item');
	open(new URL(item.type != 'inode/directory' ? item.dataURL : '/raw/storage/directory-zip/' + item.id, origin), '_blank');
}

/**
 * Download multiple items together as a single ZIP file.
 */
export function _downloadItems(...ids: string[]) {
	if (!ids.length) throw text('storage.generic.no_item');

	const url = new URL('/raw/storage/directory-zip', origin);
	url.searchParams.set('ids', ids.join(','));
	open(url, '_blank');
}

interface PendingUpload {
	file: File;
	/** The directory the file will be uploaded into */
	parentId: string | undefined;
	name: string;
	/** Whether the file is a direct child of the upload target */
	top: boolean;
}

/**
 * Sequentially upload files, reporting the overall progress in bytes via `io.progress`.
 * The upload can be cancelled from the progress toast.
 */
async function uploadAll(uploads: PendingUpload[], onItem?: (item: StorageItemMetadata) => void): Promise<void> {
	if (!uploads.length) return;

	const totalBytes = uploads.reduce((total, { file }) => total + file.size, 0);
	let uploadedBytes = 0;

	const controller = new AbortController();

	setProgressCancel(() => controller.abort());
	io.start(
		uploads.length == 1
			? text('storage.generic.uploading_one', { name: uploads[0].name })
			: text('storage.generic.uploading_many', { count: uploads.length })
	);

	try {
		for (const { file, parentId, name, top } of uploads) {
			const item = await createItemFromFile(file, {
				parentId,
				name,
				onProgress: uploaded => io.progress(uploadedBytes + uploaded, totalBytes, uploads.length > 1 ? name : undefined),
				signal: controller.signal,
			});
			uploadedBytes += file.size;
			if (top) onItem?.(item);
		}
	} finally {
		io.done(true);
	}
}

/**
 * Display the outcome of an upload as a toast, like `toastStatus`,
 * except cancelled uploads are reported as info rather than an error.
 */
export async function toastUpload(upload: Promise<unknown>): Promise<void> {
	try {
		await upload;
		await toast('success', text('storage.generic.upload_success'));
	} catch (e) {
		if (e instanceof DOMException && e.name == 'AbortError') await toast('info', text('storage.generic.upload_cancelled'));
		else await toast('error', e);
	}
}

/**
 * Recursively upload a list of drag-and-drop filesystem entries into the folder identified by `parentId`.
 */
export async function uploadEntries(
	entries: Iterable<FileSystemEntry>,
	parentId: string | null | undefined,
	onItem?: (item: StorageItemMetadata) => void
): Promise<void> {
	parentId ??= undefined;
	const uploads: PendingUpload[] = [];

	async function collect(entries: Iterable<FileSystemEntry>, dirId: string | undefined): Promise<void> {
		for (const entry of entries) {
			if (entry.isDirectory) {
				const dir = await createDirectory(entry.name, dirId);
				if (dirId == parentId) onItem?.(dir);
				const reader = (entry as FileSystemDirectoryEntry).createReader();

				const read = () => new Promise(reader.readEntries.bind(reader));
				for (let batch = await read(); batch.length; batch = await read()) await collect(batch, dir.id);
			} else {
				const file = await new Promise((entry as FileSystemFileEntry).file.bind(entry));
				uploads.push({ file, parentId: dirId, name: file.name, top: dirId == parentId });
			}
		}
	}

	await collect(entries, parentId);
	await uploadAll(uploads, onItem);
}

/**
 * Upload files picked with a file input into the folder identified by `parentId`.
 * For directory uploads, directories are created as needed from `webkitRelativePath`.
 */
export async function uploadFiles(
	files: Iterable<File>,
	parentId: string | null | undefined,
	onItem?: (item: StorageItemMetadata) => void
): Promise<void> {
	parentId ??= undefined;
	const directoryIds = new Map<string, string>();
	const uploads: PendingUpload[] = [];

	for (const file of files) {
		const path = file.webkitRelativePath?.split('/').filter(part => part.length) || [];
		const name = path.pop() || file.name;

		let itemParentId: string | undefined = parentId,
			currentDir = '';

		for (const directoryName of path) {
			currentDir = currentDir ? `${currentDir}/${directoryName}` : directoryName;

			let dirId = directoryIds.get(currentDir);
			if (!dirId) {
				const dir = await createDirectory(directoryName, itemParentId);
				if (itemParentId == parentId) onItem?.(dir);
				directoryIds.set(currentDir, dir.id);
				dirId = dir.id;
			}
			itemParentId = dirId;
		}

		uploads.push({ file, parentId: itemParentId, name, top: itemParentId == parentId });
	}

	await uploadAll(uploads, onItem);
}

/**
 * Move the given items into the folder identified by `parentId` (or the root when `null`).
 *
 * The destination is skipped if it is among the moved items, since a folder can not be moved into itself.
 * Returns the ids that were actually moved.
 */
export async function moveItems(ids: string[], parentId: string | null): Promise<string[]> {
	const toMove = ids.filter(id => id != parentId);
	await Promise.all(toMove.map(id => updateItemMetadata(id, { parentId })));
	return toMove;
}
