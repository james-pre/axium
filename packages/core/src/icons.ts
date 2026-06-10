import mime from 'mime';
import icons from '../data/mime-icons.json' with { type: 'json' };

export function forMime(mimeType: string): string {
	if (mimeType in icons) return icons[mimeType as keyof typeof icons];
	const [prefix] = mimeType.split('/');
	if (prefix in icons) return icons[prefix as keyof typeof icons];
	return 'file';
}

export function forPath(path: string): string {
	const type = mime.getType(path) || 'application/octet-stream';
	return forMime(type);
}
