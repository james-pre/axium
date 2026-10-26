import { omit, type Entries, type Omit } from 'utilium';
import * as z from 'zod';
import { UserPublic } from './user.js';

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

const reservedNames = Object.keys(AccessControl.shape).map(key => key.toLowerCase());

export const PermissionName = z
	.string()
	.toLowerCase()
	.regex(/^\w+$/)
	.max(50)
	.refine(name => !reservedNames.includes(name), { error: issue => `"${String(issue.input)}" is reserved` });

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

export function controlMatchesUser(control: AccessControl, user?: Pick<UserPublic, 'id' | 'roles' | 'tags'>): boolean {
	if (!control.role && !control.tag && !control.userId) return true;
	if (!user) return false;
	return !!(
		control.userId === user.id ||
		(control.role && user.roles.includes(control.role)) ||
		(control.tag && user.tags?.includes(control.tag))
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
	user: Pick<UserPublic, 'id' | 'roles' | 'tags'>,
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
	permissions: z.record(PermissionName, z.boolean()),
});

export interface AccessControlUpdate extends z.infer<typeof AccessControlUpdate> {}

// configuration, used by plugins

export const PermissionConfig = z.object({
	default: z.boolean().default(false),
	implies: PermissionName.array().default([]),
});
export interface PermissionConfig extends z.infer<typeof PermissionConfig> {}

export const AccessControlConfig = z
	.object({
		permissions: z.record(PermissionName, PermissionConfig),
		/** Notify users when their permissions change (e.g. shared) */
		notifications: z
			.object({
				enabled: z.boolean(),
				name: z.string(),
				url: z.string(),
			})
			.optional(),
		/** If true, presets must be used */
		force_presets: z.boolean().default(false),
		presets: z.record(z.string(), PermissionName.array()).default({}),
	})
	.superRefine((config, context) => {
		let valid = true;
		const issue = (path: PropertyKey[], message: string) => {
			valid = false;
			context.addIssue({ code: 'custom', path, message });
		};

		for (const [name, { implies }] of Object.entries(config.permissions)) {
			for (const implied of implies) {
				if (!(implied in config.permissions)) issue(['permissions', name, 'implies'], `Unknown permission "${implied}"`);
				if (implied == name) issue(['permissions', name, 'implies'], 'A permission can not imply itself');
			}
		}

		for (const [preset, permissions] of Object.entries(config.presets)) {
			for (const name of permissions) {
				if (!(name in config.permissions)) issue(['presets', preset], `Unknown permission "${name}"`);
			}
		}

		if (config.force_presets && !Object.keys(config.presets).length) issue(['force_presets'], 'Presets are forced but none exist');

		if (!valid) return;

		for (const [name, permission] of Object.entries(config.permissions)) {
			if (!permission.default) continue;
			for (const implied of impliedPermissions(config, name)) {
				if (!config.permissions[implied].default) issue(['permissions', implied, 'default'], `Must be true since "${name}" is`);
			}
		}

		for (const [preset, permissions] of Object.entries(config.presets)) {
			for (const name of permissions) {
				for (const implied of impliedPermissions(config, name)) {
					if (!permissions.includes(implied)) issue(['presets', preset], `Missing "${implied}", which "${name}" implies`);
				}
			}
		}
	});
export interface AccessControlConfig extends z.infer<typeof AccessControlConfig> {}

/** Get a permission and every permission it implies, directly or indirectly. */
export function impliedPermissions(config: Pick<AccessControlConfig, 'permissions'>, name: string): Set<string> {
	const result = new Set<string>();
	const pending = [name];

	while (pending.length) {
		const current = pending.pop()!;
		if (result.has(current)) continue;
		result.add(current);
		pending.push(...(config.permissions[current]?.implies ?? []));
	}

	return result;
}

/** Get a permission and every permission that implies it, directly or indirectly. */
export function implyingPermissions(config: Pick<AccessControlConfig, 'permissions'>, name: string): Set<string> {
	return new Set(Object.keys(config.permissions).filter(other => impliedPermissions(config, other).has(name)));
}

/**
 * Expand permission changes to include implied permissions.
 * Granting a permission grants what it implies, and revoking one revokes what implies it.
 * @throws if a permission is unknown or the changes conflict
 */
export function resolvePermissions(config: AccessControlConfig, changes: Record<string, boolean>): Record<string, boolean> {
	const resolved: Record<string, boolean> = {};

	for (const [name, value] of Object.entries(changes)) {
		if (!(name in config.permissions)) throw new Error('Unknown permission: ' + name);

		for (const affected of value ? impliedPermissions(config, name) : implyingPermissions(config, name)) {
			if (affected in resolved && resolved[affected] !== value) throw new Error('Conflicting changes for permission: ' + affected);
			resolved[affected] = value;
		}
	}

	return resolved;
}
