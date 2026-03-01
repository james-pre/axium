import * as z from 'zod';
import { UserPublic } from './user.js';
import { omit, type Omit } from 'utilium';

export const AccessControl = z
	.object({
		itemId: z.uuid(),
		userId: z.uuid().nullish(),
		role: z.string().nullish(),
		tag: z.string().nullish(),
		user: UserPublic.nullish(),
		createdAt: z.coerce.date(),
	})
	.catchall(z.boolean());

export interface AccessControl extends z.infer<typeof AccessControl> {}

export function getTarget(ac: AccessControl): AccessTarget {
	if (ac.userId) return ac.userId;
	if (ac.role) return '@' + ac.role;
	if (ac.tag) return '#' + ac.tag;
	return 'public';
}

export function fromTarget(target: AccessTarget): Partial<Pick<AccessControl, 'userId' | 'role' | 'tag'>> {
	if (target == 'public') return { userId: null, role: null, tag: null };
	if (target[0] == '@') return { userId: null, role: target.slice(1), tag: null };
	if (target[0] == '#') return { userId: null, role: null, tag: target.slice(1) };
	return { userId: target, role: null, tag: null };
}

export function pickPermissions<T extends AccessControl & object>(
	ac: T
): Omit<T, 'itemId' | 'userId' | 'role' | 'tag' | 'user' | 'createdAt'> {
	return omit(ac, 'itemId', 'userId', 'role', 'tag', 'user', 'createdAt');
}

export interface AccessControllable {
	id: string;
	userId: string;
	parentId?: string | null;
	acl?: AccessControl[];
}

export const AccessTarget = z.union([
	z.uuid(),
	z.templateLiteral(['@', z.string()]),
	z.templateLiteral(['#', z.string()]),
	z.literal('public'),
]);

export type AccessTarget = z.infer<typeof AccessTarget>;

export const AccessControlUpdate = z.object({
	target: AccessTarget,
	permissions: z.record(z.string(), z.any()),
});

export interface AccessControlUpdate extends z.infer<typeof AccessControlUpdate> {}
