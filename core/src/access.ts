import * as z from 'zod';
import type { User } from './user.js';
import { omit } from 'utilium';

export interface AccessControl {
	itemId: string;
	userId?: string | null;
	role?: string | null;
	user?: User;
	createdAt: Date;
}

export function pickPermissions<T extends AccessControl & object>(ac: T): Omit<T, 'itemId' | 'userId' | 'role' | 'user' | 'createdAt'> {
	return omit(ac, ['itemId', 'userId', 'role', 'user', 'createdAt']);
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
