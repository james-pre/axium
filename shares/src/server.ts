import type { UserInternal } from '@axium/server/auth';
import type { Schema } from '@axium/server/database';
import { database, userFromId } from '@axium/server/database';
import type { ExpressionBuilder, Generated, Selectable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { Share, Shareable } from './common.js';

export interface DBShare {
	itemId: string;
	userId: string;
	sharedAt: Generated<Date>;
	permission: number;
}

declare module '@axium/server/database' {
	export interface Schema {
		[key: `shares.${string}`]: DBShare;
	}
}

type _TableNames = (string & keyof Schema) &
	keyof {
		[K in Exclude<keyof Schema, `shares.${string}`> as Selectable<Schema[K]> extends Omit<Shareable, 'shares'> ? K : never]: null;
	};

/**
 * `never` causes a ton of problems, so we use `string` if none of the tables are shareable.
 */
export type ShareableTable = _TableNames extends never ? string : _TableNames;

declare module '@axium/server/config' {
	export interface Config {
		shares: (keyof Schema)[];
	}
}

export interface ShareInternal extends Share {
	user?: UserInternal;
}

export async function createShare(itemType: ShareableTable, data: Omit<Share, 'sharedAt'>): Promise<ShareInternal> {
	return await database.insertInto(`shares.${itemType}`).values(data).returningAll().executeTakeFirstOrThrow();
}

export async function deleteShare(itemType: ShareableTable, itemId: string, userId: string): Promise<void> {
	await database.deleteFrom(`shares.${itemType}`).where('itemId', '=', itemId).where('userId', '=', userId).execute();
}

/**
 * Helper to select all shares for a given table, including the user information.
 */
export function sharesFrom(table: ShareableTable) {
	return (eb: ExpressionBuilder<Schema, any>) =>
		jsonArrayFrom(
			eb
				.selectFrom(`shares.${table}`)
				.selectAll()
				.select(userFromId)
				.whereRef(`shares.${table}.itemId`, '=', `${table}.id` as any)
		)
			.$castTo<Required<Share>[]>()
			.as('shares');
}

export async function getShares(itemType: ShareableTable, itemId: string): Promise<Required<ShareInternal>[]> {
	return await database.selectFrom(`shares.${itemType}`).where('itemId', '=', itemId).selectAll().select(userFromId).execute();
}
