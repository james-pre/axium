import type { User } from './user.js';

export interface AccessControl {
	itemId: string;
	userId: string;
	user?: User;
	createdAt: Date;
	permission: Permission;
}

export enum Permission {
	None = 0,
	Read = 1,
	Comment = 2,
	Edit = 3,
	Manage = 5,
}

export const permissionNames = {
	[Permission.None]: 'No Permissions',
	[Permission.Read]: 'Reader',
	[Permission.Comment]: 'Commenter',
	[Permission.Edit]: 'Editor',
	[Permission.Manage]: 'Manager',
} satisfies Record<Permission, string>;

export interface AccessControllable {
	userId: string;
	publicPermission: Permission;
	acl?: AccessControl[];
}

export function hasPermission(item: AccessControllable, userId: string | undefined, permission: Permission): boolean {
	if (item.publicPermission >= permission) return true;
	if (!userId) return false;
	if (item.userId == userId) return true;

	const entry = item.acl?.find(entry => entry.userId == userId);
	if (!entry) return false;

	return entry.permission >= permission;
}
