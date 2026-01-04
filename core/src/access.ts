import * as z from 'zod';
import type { User } from './user.js';

export interface AccessControl {
	itemId: string;
	userId?: string | null;
	role?: string | null;
	user?: User;
	createdAt: Date;
}

export interface AccessControllable {
	userId: string;
	acl?: AccessControl[];
}

export const AccessMap = z.record(
	z.union([z.uuid(), z.templateLiteral(['@', z.string()]), z.templateLiteral(['#', z.string()]), z.literal('public')]),
	z.any()
);

export interface AccessMap extends z.infer<typeof AccessMap> {}
