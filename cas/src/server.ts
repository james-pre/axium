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
import z from 'zod/v4';
import { CASUpdate, type CASMetadata } from './common.js';
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
	/** The maximum size per file in MB */
	max_item_size: number;
	/** How many days files are kept in the trash */
	trash_duration: number;
	/** The maximum storage size per user in MB */
	max_user_size: number;
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
		max_item_size: 100,
		trash_duration: 30,
		max_user_size: 1000,
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
export async function currentUsage(userId: string): Promise<number> {
	connect();
	const result = await database
		.selectFrom('cas')
		.where('ownerId', '=', userId)
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return Number(result.size);
}

export async function get(itemId: string): Promise<CASMetadata> {
	connect();
	const result = await database.selectFrom('cas').where('itemId', '=', itemId).selectAll().executeTakeFirstOrThrow();
	return parseItem(result);
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

		const using = await currentUsage(userId);

		const name = event.request.headers.get('x-name');
		if ((name?.length || 0) > 255) error(400, 'Name is too long');

		const size = Number(event.request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing size header');

		if ((using + size) / 1_000_000 >= config.cas.max_user_size) error(409, 'Not enough space');

		if (size > config.cas.max_item_size * 1_000_000) error(413, 'File size exceeds maximum size');

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
				'Content-Disposition': `attachment; filename="${itemId}"`,
			},
		});
	},
});

addRoute({
	path: '/api/users/:id/cas',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'users/:id/cas'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const userId = event.params.id!;

		await checkAuth(event, userId);

		const items = await database.selectFrom('cas').where('ownerId', '=', userId).selectAll().execute();

		const usage = await currentUsage(userId);

		const limit = config.cas.max_user_size * 1_000_000;

		return { usage, limit, items: items.map(parseItem) };
	},
});
