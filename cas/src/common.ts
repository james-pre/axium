import type {} from '@axium/core/api';
import z from 'zod';

export interface CASLimits {
	/** The maximum storage size per user in MB */
	user_size: number;
	/** The maximum size per item in MB */
	item_size: number;
	/** Maximum number of items per user */
	user_items: number;
}

export interface CASUsage {
	bytes: number;
	items: number;
}

export const CASUpdate = z.object({
	owner: z.uuid().optional(),
	name: z.string().optional(),
	trash: z.boolean().optional(),
	restrict: z.boolean().optional(),
});

export type CASUpdate = z.infer<typeof CASUpdate>;

export interface CASMetadata {
	itemId: string;
	ownerId: string;
	lastModified: Date;
	/** Whether editing the file is restricted to managers */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	hash: string;
	type: string;
	name: string | null;
	data_url?: string;
}

export interface UserCASInfo {
	usage: CASUsage;
	limits: CASLimits;
	items: CASMetadata[];
}

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/cas': {
			OPTIONS: { usage: CASUsage; limits: CASLimits };
			GET: UserCASInfo;
		};
		'cas/item/:id': {
			GET: CASMetadata;
			DELETE: CASMetadata;
			PATCH: [z.input<typeof CASUpdate>, CASMetadata];
		};
	}
}
