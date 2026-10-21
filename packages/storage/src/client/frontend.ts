import type { StorageItemMetadata } from '@axium/storage/common';
import { copy } from '@axium/client/web';
import { confirm } from '@axium/client/dialogs';
import { progressToast, toast } from '@axium/client/toast';
import { encodeUUID, type UUID } from 'utilium';
import { origin, text } from '@axium/client';
import { createDirectory, createItemFromFile, deleteItem, getDirectoryMetadata, updateItemMetadata } from './api.js';

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

/** Called with each item created directly in the upload target, and the ID of the item it replaced. */
export type UploadItemHandler = (item: StorageItemMetadata, replaced?: string) => void;

interface PendingUpload {
	file: File;
	/** The directory the file will be uploaded into */
	parentId: string | undefined;
	name: string;
	/** Whether the file is a direct child of the upload target */
	top: boolean;
	/** The ID of the existing item deleted before this file is uploaded */
	replaces?: string;
}

/**
 * Find the items in `parentId` whose names are in `names`, asking the user whether to replace them.
 * Items in the root folder never conflict.
 * @returns The IDs of the items to replace, keyed by name
 * @throws An `AbortError` if the user declines
 */
async function confirmReplacements(names: Iterable<string>, parentId: string | undefined): Promise<Map<string, string>> {
	if (!parentId) return new Map();

	const uploading = new Set(names);
	const conflicts = new Map(
		(await getDirectoryMetadata(parentId)).filter(item => uploading.has(item.name)).map(item => [item.name, item.id])
	);

	if (!conflicts.size) return conflicts;

	const message =
		conflicts.size == 1
			? text('storage.generic.replace_confirm', { name: conflicts.keys().next().value! })
			: text('storage.generic.replace_confirm_many', { count: conflicts.size });

	if (!(await confirm(message, { confirmText: text('storage.generic.replace'), danger: true })))
		throw new DOMException('Upload cancelled', 'AbortError');

	return conflicts;
}

/**
 * Sequentially upload files, reporting the overall progress in bytes.
 * The upload can be cancelled from the progress toast.
 */
async function uploadAll(uploads: PendingUpload[], onItem?: UploadItemHandler): Promise<void> {
	if (!uploads.length) return;

	const totalBytes = uploads.reduce((total, { file }) => total + file.size, 0);
	let uploadedBytes = 0;

	using status = progressToast(
		uploads.length == 1
			? text('storage.generic.uploading_one', { name: uploads[0].name })
			: text('storage.generic.uploading_many', { count: uploads.length })
	);

	for (const { file, parentId, name, top, replaces } of uploads) {
		if (replaces) await deleteItem(replaces);
		const item = await createItemFromFile(file, {
			parentId,
			name,
			onProgress: uploaded => status.progress(uploadedBytes + uploaded, totalBytes, uploads.length > 1 ? name : undefined),
			signal: status.signal,
		});
		uploadedBytes += file.size;
		if (top) onItem?.(item, replaces);
	}
}

/**
 * Display the outcome of an upload as a toast, like `toastStatus`,
 * except cancelled uploads are reported as info rather than an error.
 */
export async function toastUpload(upload: Promise<unknown>): Promise<void> {
	try {
		await upload;
		void toast('success', text('storage.generic.upload_success'));
	} catch (e) {
		if (e instanceof DOMException && e.name == 'AbortError') void toast('info', text('storage.generic.upload_cancelled'));
		else void toast('error', e);
	}
}

/**
 * Recursively upload a list of drag-and-drop filesystem entries into the folder identified by `parentId`.
 */
export async function uploadEntries(
	entries: Iterable<FileSystemEntry>,
	parentId: string | null | undefined,
	onItem?: UploadItemHandler
): Promise<void> {
	parentId ??= undefined;
	const topEntries = Array.from(entries);
	const replacements = await confirmReplacements(
		topEntries.map(entry => entry.name),
		parentId
	);
	const uploads: PendingUpload[] = [];

	async function collect(entries: Iterable<FileSystemEntry>, dirId: string | undefined): Promise<void> {
		for (const entry of entries) {
			const top = dirId == parentId;
			const replaces = top ? replacements.get(entry.name) : undefined;

			if (entry.isDirectory) {
				if (replaces) await deleteItem(replaces);
				const dir = await createDirectory(entry.name, dirId);
				if (top) onItem?.(dir, replaces);
				const reader = (entry as FileSystemDirectoryEntry).createReader();

				const read = () => new Promise(reader.readEntries.bind(reader));
				for (let batch = await read(); batch.length; batch = await read()) await collect(batch, dir.id);
			} else {
				const file = await new Promise((entry as FileSystemFileEntry).file.bind(entry));
				uploads.push({ file, parentId: dirId, name: file.name, top, replaces });
			}
		}
	}

	await collect(topEntries, parentId);
	await uploadAll(uploads, onItem);
}

/**
 * Upload files picked with a file input into the folder identified by `parentId`.
 * For directory uploads, directories are created as needed from `webkitRelativePath`.
 */
export async function uploadFiles(files: Iterable<File>, parentId: string | null | undefined, onItem?: UploadItemHandler): Promise<void> {
	parentId ??= undefined;
	const directoryIds = new Map<string, string>();
	const uploads: PendingUpload[] = [];

	const paths = Array.from(files, file => {
		const path = file.webkitRelativePath?.split('/').filter(part => part.length) || [];
		return { file, path: path.length ? path : [file.name] };
	});

	const replacements = await confirmReplacements(
		paths.map(({ path }) => path[0]),
		parentId
	);

	for (const { file, path } of paths) {
		const name = path.pop()!;

		let itemParentId: string | undefined = parentId,
			currentDir = '';

		for (const directoryName of path) {
			currentDir = currentDir ? `${currentDir}/${directoryName}` : directoryName;

			let dirId = directoryIds.get(currentDir);
			if (!dirId) {
				const replaces = itemParentId == parentId ? replacements.get(directoryName) : undefined;
				if (replaces) await deleteItem(replaces);
				const dir = await createDirectory(directoryName, itemParentId);
				if (itemParentId == parentId) onItem?.(dir, replaces);
				directoryIds.set(currentDir, dir.id);
				dirId = dir.id;
			}
			itemParentId = dirId;
		}

		const top = itemParentId == parentId;
		uploads.push({ file, parentId: itemParentId, name, top, replaces: top ? replacements.get(name) : undefined });
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
