import type {} from '@axium/core/api';
import z from 'zod/v4';

export const CASUpdate = z.object({
	set_owner: z.uuid().optional(),
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
	data_url?: string;
}

declare module '@axium/core/api' {
	export interface _apiTypes {
		'cas/item/:id': {
			GET: CASMetadata;
			DELETE: CASMetadata;
			PATCH: [z.input<typeof CASUpdate>, CASMetadata];
		};
	}
}
