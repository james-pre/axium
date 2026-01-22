import * as z from 'zod';
import { User } from './user.js';
import { omit, type Omit } from 'utilium';

export const AccessControl = z.object({
	itemId: z.uuid(),
	userId: z.uuid().nullish(),
	role: z.string().nullish(),
	user: User.optional(),
	createdAt: z.coerce.date(),
});

export interface AccessControl extends z.infer<typeof AccessControl> {}

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
