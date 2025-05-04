import mime from 'mime';
import mimeIcons from './mime.json' with { type: 'json' };

export { default as Icon } from './Icon.svelte';

export function iconFor(path: string): string {
	type K = keyof typeof mimeIcons;
	const type = mime.getType(path) || 'application/octet-stream';
	return mimeIcons[type as K] || mimeIcons[type.split('/')[0] as K] || 'file';
}
