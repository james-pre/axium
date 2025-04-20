import type { User } from '@axium/core/schemas';

export interface Share {
	itemId: string;
	userId: string;
	user?: User;
	sharedAt: Date;
	permission: number;
}

export enum Visibility {
	Private = 0,
	Friends = 10,
	Public = 20,
}

export function visibilityText(vis: Visibility): string {
	if (vis >= Visibility.Public) return 'Public';
	if (vis >= Visibility.Friends) return 'Friends';
	return 'Private';
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

export interface Item {
	visibility: Visibility;
	userId: string;
	shares?: Share[];
}

export function hasPermission(item: Item, userId: string | undefined, permission: number): boolean {
	if (item.visibility >= Visibility.Public) return true;
	if (!userId) return false;
	if (item.userId == userId) return true;

	/** @todo Once friends are implemented, add logic here */

	const share = item.shares?.find(share => share.userId == userId);
	if (!share) return false;

	return share.permission >= permission;
}
