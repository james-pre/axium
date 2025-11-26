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
