import type { Schema } from '@axium/server/database.js';
import { database } from '@axium/server/database.js';
import type { Generated } from 'kysely';
import type { Share } from './common.js';

export interface DBShare {
	itemId: string;
	userId: string;
	sharedAt: Generated<Date>;
	permission: number;
}

declare module '@axium/server/database.js' {
	export interface Schema {
		[key: `shares.${string}`]: DBShare;
	}
}

declare module '@axium/server/config.js' {
	export interface Config {
		shares: (keyof Schema)[];
	}
}

export function sharesTableFor(itemType: keyof Schema): `shares.${string}` {
	const table = itemType.split('.').at(-1)!;
	return `shares.${table}`;
}

export async function createShare(itemType: keyof Schema, data: Omit<Share, 'sharedAt'>): Promise<Share> {
	return await database.insertInto(sharesTableFor(itemType)).values(data).returningAll().executeTakeFirstOrThrow();
}

export async function deleteShare(itemType: keyof Schema, itemId: string, userId: string): Promise<void> {
	await database.deleteFrom(sharesTableFor(itemType)).where('itemId', '=', itemId).where('userId', '=', userId).execute();
}

export async function getShares(itemType: keyof Schema, itemId: string): Promise<Required<Share>[]> {
	const shares = await database.selectFrom(sharesTableFor(itemType)).where('itemId', '=', itemId).selectAll().execute();

	if (!shares.length) return [];

	const users = await database
		.selectFrom('users')
		.selectAll()
		.where(
			'id',
			'in',
			shares.map(s => s.userId)
		)
		.execute();

	const userMap = new Map(users.map(u => [u.id, u]));

	return shares.map(share => ({
		...share,
		user: userMap.get(share.userId)!,
	}));
}
