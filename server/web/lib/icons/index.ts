import mime from 'mime';
import mimeIcons from './mime.json' with { type: 'json' };

export { default as Icon } from './Icon.svelte';

export function iconForMime(mimeType: string): string {
	return mimeIcons[mimeType as keyof typeof mimeIcons] || 'file';
}

export function iconForPath(path: string): string {
	const type = mime.getType(path) || 'application/octet-stream';
	return iconForMime(type);
}
