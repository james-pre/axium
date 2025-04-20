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
		Share: DBShare;
	}
}

declare module '@axium/server/config.js' {
	export interface Config {
		shares: (keyof Schema)[];
	}
}

export async function share(itemType: keyof Schema, itemId: string, userId: string, permission: number): Promise<void> {
	await database.withSchema('shares').insertInto(itemType).values({ itemId, userId, permission }).execute();
}

export async function unshare(itemType: keyof Schema, itemId: string, userId: string): Promise<void> {
	await database.withSchema('shares').deleteFrom(itemType).where('itemId', '=', itemId).where('userId', '=', userId).execute();
}

export async function getShares(itemType: keyof Schema, itemId: string): Promise<Required<Share>[]> {
	const shares = await database.withSchema('shares').selectFrom(itemType).where('itemId', '=', itemId).selectAll().execute();

	if (!shares.length) return [];

	const users = await database
		.selectFrom('User')
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
