import type { Result } from '@axium/core/api';
import { getSessionAndUser } from '@axium/server/auth';
import { addConfigDefaults, config } from '@axium/server/config';
import { connect, database, type Schema } from '@axium/server/database';
import { dirs } from '@axium/server/io';
import { checkAuth, getToken, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { error } from '@sveltejs/kit';
import type { Generated, Selectable } from 'kysely';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import z from 'zod';
import { CASUpdate, type CASLimits, type CASMetadata, type CASUsage } from './common.js';
import './polyfills.js';

declare module '@axium/server/database' {
	export interface Schema {
		cas: {
			itemId: Generated<string>;
			ownerId: string;
			lastModified: Generated<Date>;
			restricted: Generated<boolean>;
			size: number;
			trashedAt: Date | null;
			hash: Uint8Array;
			name: string | null;
			type: string;
		};
	}
}

export interface CASConfig {
	/** Whether the CAS API endpoints are enabled */
	enabled?: boolean;
	/** Path to data directory */
	data: string;
	/** How many days files are kept in the trash */
	trash_duration: number;
	/** Default limits */
	limits: CASLimits;
}

declare module '@axium/server/config' {
	export interface Config {
		cas: CASConfig;
	}
}

addConfigDefaults({
	cas: {
		enabled: true,
		data: dirs.at(-1)! + '/cas',
		trash_duration: 30,
		limits: {
			user_size: 1000,
			item_size: 100,
			user_items: 10_000,
		},
	},
});

export interface CASItem extends CASMetadata {
	data: Uint8Array<ArrayBufferLike>;
}

function parseItem(item: Selectable<Schema['cas']>): CASMetadata {
	return {
		...item,
		hash: item.hash.toHex(),
		data_url: `/raw/cas/${item.itemId}`,
	};
}

/**
 * Returns the current usage of the CAS for a user in bytes.
 */
export async function currentUsage(userId: string): Promise<CASUsage> {
	connect();
	const result = await database
		.selectFrom('cas')
		.where('ownerId', '=', userId)
		.select(database.fn.countAll<number>().as('items'))
		.select(eb => eb.fn.sum<number>('size').as('bytes'))
		.executeTakeFirstOrThrow();

	return result;
}

export async function get(itemId: string): Promise<CASMetadata> {
	connect();
	const result = await database.selectFrom('cas').where('itemId', '=', itemId).selectAll().executeTakeFirstOrThrow();
	return parseItem(result);
}

export type ExternalLimitHandler = (userId?: string) => CASLimits | Promise<CASLimits>;

let _getLimits: ExternalLimitHandler | null = null;

/**
 * Define the handler to get limits for a user externally.
 */
export function useLimits(handler: ExternalLimitHandler): void {
	_getLimits = handler;
}

export async function getLimits(userId?: string): Promise<CASLimits> {
	try {
		return await _getLimits!(userId);
	} catch {
		return config.cas.limits;
	}
}

addRoute({
	path: '/api/cas/item/:id',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'cas/item/:id'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'CAS item not found');

		await checkAuth(event, item.ownerId);

		return item;
	},
	async PATCH(event): Result<'PATCH', 'cas/item/:id'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const itemId = event.params.id!;

		const body = await parseBody(event, CASUpdate);

		const item = await get(itemId);
		if (!item) error(404, 'CAS item not found');

		await checkAuth(event, item.ownerId);

		const values: Partial<Pick<CASMetadata, 'restricted' | 'trashedAt' | 'ownerId' | 'name'>> = {};
		if ('restrict' in body) values.restricted = body.restrict;
		if ('trash' in body) values.trashedAt = body.trash ? new Date() : null;
		if ('owner' in body) values.ownerId = body.owner;
		if ('name' in body) values.name = body.name;

		if (!Object.keys(values).length) error(400, 'No valid fields to update');

		return parseItem(
			await database
				.updateTable('cas')
				.where('itemId', '=', itemId)
				.set(values)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update CAS item'))
		);
	},
	async DELETE(event): Result<'DELETE', 'cas/item/:id'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'CAS item not found');

		await checkAuth(event, item.ownerId);

		await database
			.deleteFrom('cas')
			.where('itemId', '=', itemId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete CAS item'));

		const { count } = await database
			.selectFrom('cas')
			.where('hash', '=', Uint8Array.fromHex(item.hash))
			.select(eb => eb.fn.countAll().as('count'))
			.executeTakeFirstOrThrow();

		if (!Number(count)) unlinkSync(join(config.cas.data, item.hash));

		return item;
	},
});

addRoute({
	path: '/raw/cas/upload',
	async PUT(event): Promise<CASMetadata> {
		if (!config.cas.enabled) error(403, 'CAS is disabled');

		const token = getToken(event);
		if (!token) error(401, 'Missing session token');

		const { userId } = await getSessionAndUser(token).catch(withError('Invalid session token', 401));

		const usage = await currentUsage(userId);

		const name = event.request.headers.get('x-name');
		if ((name?.length || 0) > 255) error(400, 'Name is too long');

		const size = Number(event.request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing size header');

		if (usage.items >= config.cas.limits.user_items) error(409, 'Too many items');

		if ((usage.bytes + size) / 1_000_000 >= config.cas.limits.user_size) error(409, 'Not enough space');

		if (size > config.cas.limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await event.request.bytes();

		// @todo: add this to the audit log
		if (content.byteLength > size) error(400, 'Content length does not match size header!');

		const hash = createHash('BLAKE2b512').update(content).digest();

		mkdirSync(config.cas.data, { recursive: true });

		writeFileSync(join(config.cas.data, hash.toHex()), content);

		const result = await database
			.insertInto('cas')
			.values({
				ownerId: userId,
				hash,
				name: event.request.headers.get('x-name'),
				size,
				type: event.request.headers.get('content-type') || 'application/octet-stream',
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		return parseItem(result);
	},
});

addRoute({
	path: '/raw/cas/:id',
	params: { id: z.uuid() },
	async GET(event) {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'CAS item not found');

		await checkAuth(event, item.ownerId);

		const content = new Uint8Array(readFileSync(join(config.cas.data, item.hash)));

		return new Response(content, {
			headers: {
				'Content-Type': item.type,
				'Content-Disposition': `attachment; filename="${item.name}"`,
			},
		});
	},
});

addRoute({
	path: '/api/users/:id/cas',
	params: { id: z.uuid() },
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/cas'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const userId = event.params.id!;
		await checkAuth(event, userId);

		const [usage, limits] = await Promise.all([currentUsage(userId), getLimits(userId)]).catch(withError('Could not fetch CAS data'));

		return { usage, limits };
	},
	async GET(event): Result<'GET', 'users/:id/cas'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const userId = event.params.id!;

		await checkAuth(event, userId);

		const [items, usage, limits] = await Promise.all([
			database.selectFrom('cas').where('ownerId', '=', userId).selectAll().execute(),
			currentUsage(userId),
			getLimits(userId),
		]).catch(withError('Could not fetch CAS data'));

		return { usage, limits, items: items.map(parseItem) };
	},
});
