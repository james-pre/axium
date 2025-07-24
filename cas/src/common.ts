import type {} from '@axium/core/api';
import z from 'zod';

export interface StorageLimits {
	/** The maximum storage size per user in MB */
	user_size: number;
	/** The maximum size per item in MB */
	item_size: number;
	/** Maximum number of items per user */
	user_items: number;
}

export interface FilesUsage {
	bytes: number;
	items: number;
}

/**
 * An update to file metadata.
 */
export const FileUpdate = z.object({
	owner: z.uuid().optional(),
	name: z.string().optional(),
	trash: z.boolean().optional(),
	restrict: z.boolean().optional(),
});

export type FileUpdate = z.infer<typeof FileUpdate>;

export interface FileMetadata {
	id: string;
	ownerId: string;
	createdAt: Date;
	modifiedAt: Date;
	/** Whether editing the file is restricted to the owner */
	restricted: boolean;
	parentId: string | null;
	size: number;
	trashedAt: Date | null;
	hash: string;
	type: string;
	name: string | null;
	immutable: boolean;
	dataURL?: string;
}

export interface UserFilesInfo {
	usage: FilesUsage;
	limits: StorageLimits;
	items: FileMetadata[];
}

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/storage': {
			OPTIONS: { usage: FilesUsage; limits: StorageLimits };
			GET: UserFilesInfo;
		};
		'storage/item/:id': {
			GET: FileMetadata;
			DELETE: FileMetadata;
			PATCH: [z.input<typeof FileUpdate>, FileMetadata];
		};
	}
}
