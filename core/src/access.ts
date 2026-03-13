import * as z from 'zod';
import { UserPublic, type User } from './user.js';
import { omit, type Entries, type Omit } from 'utilium';

export const AccessControl = z
	.object({
		itemId: z.uuid(),
		userId: z.uuid().nullish(),
		role: z.string().nonempty().nullish(),
		tag: z.string().nonempty().nullish(),
		user: UserPublic.nullish(),
		createdAt: z.coerce.date(),
	})
	.catchall(z.boolean());

export interface AccessControl extends z.infer<typeof AccessControl> {}

export function getTarget(ac: AccessControl): AccessTarget {
	if (ac.userId) return ac.userId;
	if (ac.role) return '@' + ac.role;
	if (ac.tag) return '#' + ac.tag;
	return null;
}

export function fromTarget(target: AccessTarget): Pick<AccessControl, 'userId' | 'role' | 'tag'> {
	if (target == null) return { userId: null, role: null, tag: null };
	if (target[0] == '@') return { userId: null, role: target.slice(1), tag: null };
	if (target[0] == '#') return { userId: null, role: null, tag: target.slice(1) };
	return { userId: target, role: null, tag: null };
}

export function controlMatchesUser(control: AccessControl, user: Pick<User, 'id' | 'roles' | 'tags'>): boolean {
	return !!(
		(!control.role && !control.tag && !control.userId) ||
		control.userId === user.id ||
		(control.role && user.roles.includes(control.role)) ||
		(control.tag && user.tags.includes(control.tag))
	);
}

type NonPermKeys = keyof (typeof AccessControl)['shape'];

export type PickPermissions<T extends AccessControl> = Omit<T, NonPermKeys>;

export function pickPermissions<T extends AccessControl>(ac: T): PickPermissions<T> {
	return omit(ac, 'itemId', 'userId', 'role', 'tag', 'user', 'createdAt');
}

/**
 * Check an ACL against a set of permissions.
 * Returns the set of permissions that are missing.
 */
export function checkACL<const AC extends AccessControl>(
	acl: AC[],
	permissions: Partial<PickPermissions<AC>>
): Set<keyof PickPermissions<AC>> {
	const allowed = new Set<keyof PickPermissions<AC>>();
	const all = new Set(Object.keys(permissions) as (keyof PickPermissions<AC>)[]);
	const entries = Object.entries(permissions) as Entries<typeof permissions>;

	for (const control of acl) {
		for (const [key, needed] of entries) {
			const value = control[key];
			if (value === needed) allowed.add(key);
		}
	}

	return all.difference(allowed);
}

/**
 * Check an ACL against a set of permissions and a user.
 * Returns the set of permissions that are missing for the user.
 */
export function checkAndMatchACL<const AC extends AccessControl>(
	acl: AC[],
	user: Pick<User, 'id' | 'roles' | 'tags'>,
	permissions: Partial<PickPermissions<AC>>
): Set<keyof PickPermissions<AC>> {
	const filtered = acl.filter(c => controlMatchesUser(c, user));
	return checkACL(filtered, permissions);
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
	z.literal(null),
]);

/**
 * A primitive representation for the target of an access control.
 *
 */
export type AccessTarget = z.infer<typeof AccessTarget>;

export const AccessControlUpdate = z.object({
	target: AccessTarget,
	permissions: z.record(z.string(), z.any()),
});

export interface AccessControlUpdate extends z.infer<typeof AccessControlUpdate> {}
