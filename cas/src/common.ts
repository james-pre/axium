import type {} from '@axium/core/api';
import z from 'zod/v4';

export const CASUpdate = z.object({
	owner: z.uuid().optional(),
	name: z.string().optional(),
	trash: z.boolean().optional(),
	restrict: z.boolean().optional(),
});

export type CASUpdate = z.infer<typeof CASUpdate>;

export interface CASMetadata {
	fileId: string;
	ownerId: string;
	lastModified: Date;
	/** Whether editing the file is restricted to managers */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	hash: Uint8Array;
	type: string;
	name: string | null;
	data_url?: string;
}

export interface UserCASInfo {
	usage: number;
	limit: number;
	items: CASMetadata[];
}

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/cas': {
			GET: UserCASInfo;
		};
		'cas/item/:id': {
			GET: CASMetadata;
			DELETE: CASMetadata;
			PATCH: [z.input<typeof CASUpdate>, CASMetadata];
		};
	}
}

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];

	const i = Math.floor(Math.log10(bytes) / 3);

	const value = bytes / Math.pow(1000, i);

	return `${Number.isSafeInteger(value) ? value : value.toFixed(2)} ${units[i]}`;
}
