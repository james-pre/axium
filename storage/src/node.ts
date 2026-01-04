import { formatBytes } from '@axium/core/format';
import { styleText } from 'node:util';
import type { StorageItemMetadata } from './common.js';

const executables = ['application/x-pie-executable', 'application/x-sharedlib', 'application/vnd.microsoft.portable-executable'];

const archives = [
	'application/gzip',
	'application/vnd.rar',
	'application/x-7z-compressed',
	'application/x-bzip',
	'application/x-bzip2',
	'application/x-tar',
	'application/x-xz',
	'application/zip',
];

export function colorItem(item: StorageItemMetadata): string {
	const { type, name } = item;

	if (type === 'inode/directory') return styleText('blue', name);
	if (type.startsWith('image/') || type.startsWith('video/')) return styleText('magenta', name);
	if (type.startsWith('audio/')) return styleText('cyan', name);
	if (executables.includes(type)) return styleText('green', name);
	if (archives.includes(type)) return styleText('red', name);
	return name;
}

const __formatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: '2-digit',
	hour12: false,
	hour: '2-digit',
	minute: '2-digit',
});
const formatDate = __formatter.format.bind(__formatter);

interface FormatItemsConfig {
	items: (StorageItemMetadata & { __size?: string })[];
	users: Record<string, { name: string }>;
	humanReadable: boolean;
}

export function* formatItems({ items, users, humanReadable }: FormatItemsConfig): Generator<string> {
	let sizeWidth = 0,
		nameWidth = 0;

	for (const item of items) {
		item.__size = item.type == 'inode/directory' ? '-' : humanReadable ? formatBytes(item.size) : item.size.toString();

		sizeWidth = Math.max(sizeWidth, item.__size.length);
		nameWidth = Math.max(nameWidth, users[item.userId].name.length);
	}

	for (const item of items) {
		const owner = users[item.userId].name;

		const type = item.type == 'inode/directory' ? 'd' : '-';
		const ownerPerm = `r${item.immutable ? '-' : 'w'}x`;

		yield `${type}${ownerPerm}${ownerPerm}. ${owner.padEnd(nameWidth)} ${item.__size!.padStart(sizeWidth)} ${formatDate(item.modifiedAt)} ${colorItem(item)}`;
	}
}
