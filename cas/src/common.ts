import type { Stats } from '@zenfs/core';
import { constants as c } from '@zenfs/core';
import mime from 'mime';
import fileIcons from './file-icons.json' with { type: 'json' };

export interface FileMetadata {
	fileId: string;
	creatorId: string;
	ownerId: string;
	lastModified: Date;
	/** Whether editing the file is restricted to managers */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	hash: Uint8Array;
}

export function iconFor(path: string, stats: Stats): string {
	switch (stats.mode & c.S_IFMT) {
		case c.S_IFBLK:
		case c.S_IFCHR:
			return 'memory';
		case c.S_IFDIR:
			return 'folder';
		case c.S_IFIFO:
			return 'pipe-section';
		case c.S_IFLNK:
			return 'arrow-up-right-from-square';
		case c.S_IFSOCK:
			return 'ethernet';
		case c.S_IFREG:
		default: {
			type K = keyof typeof fileIcons;
			const type = mime.getType(path) || 'application/octet-stream';
			return fileIcons[type as K] || fileIcons[type.split('/')[0] as K] || 'file';
		}
	}
}
