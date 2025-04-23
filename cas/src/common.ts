import mime from 'mime';
import fileIcons from './file-icons.json' with { type: 'json' };

export interface FileMetadata {
	fileId: string;
	ownerId: string;
	lastModified: Date;
	/** Whether editing the file is restricted to managers */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	hash: Uint8Array;
}

export function iconFor(path: string): string {
	type K = keyof typeof fileIcons;
	const type = mime.getType(path) || 'application/octet-stream';
	return fileIcons[type as K] || fileIcons[type.split('/')[0] as K] || 'file';
}
