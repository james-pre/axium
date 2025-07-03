import type { Result } from '@axium/core/api';
import { getSessionAndUser, getUser } from '@axium/server/auth';
import { addConfigDefaults, config } from '@axium/server/config';
import { connect, database } from '@axium/server/database';
import { dirs } from '@axium/server/io';
import { addRoute } from '@axium/server/routes';
import { checkAuth, getToken, parseBody, withError } from '@axium/server/utils';
import { error } from '@sveltejs/kit';
import type { Generated } from 'kysely';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import { pick } from 'utilium';
import z from 'zod/v4';
import { CASUpdate, type CASMetadata } from './common.js';
import './polyfills.js';

declare module '@axium/server/database' {
	export interface Schema {
		cas: {
			fileId: Generated<string>;
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
	/** The maximum size per file in MiB */
	max_item_size: number;
	/** How many days files are kept in the trash */
	trash_duration: number;
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
	},
});

export interface CASItem extends CASMetadata {
	data: Uint8Array<ArrayBufferLike>;
}

export async function currentUsage(userId: string): Promise<number> {
	connect();
	const result = await database
		.selectFrom('cas')
		.where('ownerId', '=', userId)
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirstOrThrow();

	return Number(result.size);
}

export async function get(fileId: string): Promise<CASMetadata> {
	connect();
	return Object.assign(await database.selectFrom('cas').where('fileId', '=', fileId).selectAll().executeTakeFirstOrThrow(), {
		data_url: `/raw/cas/${fileId}`,
	});
}

export async function add(ownerId: string, blob: Blob): Promise<CASMetadata> {
	if (blob.size > config.cas.max_item_size * 1048576) throw new Error('File size exceeds maximum size');

	connect();

	const content = await blob.bytes();

	const hash = createHash('BLAKE2b512').update(content).digest();

	writeFileSync(join(config.cas.data, hash.toHex()), content);

	return await database
		.insertInto('cas')
		.values({ ownerId, hash, ...pick(blob, 'size', 'type') })
		.returningAll()
		.executeTakeFirstOrThrow();
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

		const values: Partial<CASMetadata> = {};
		if ('restrict' in body) values.restricted = body.restrict;
		if ('trash' in body) values.trashedAt = body.trash ? new Date() : null;
		if ('set_owner' in body) values.ownerId = body.set_owner;

		return await database
			.updateTable('cas')
			.set(values)
			.where('fileId', '=', itemId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update CAS item'));
	},
	async DELETE(event): Result<'DELETE', 'cas/item/:id'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'CAS item not found');

		await checkAuth(event, item.ownerId);

		return await database
			.deleteFrom('cas')
			.where('fileId', '=', itemId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete CAS item'));
	},
});

addRoute({
	path: '/raw/cas/upload',
	async PUT(event): Promise<CASMetadata> {
		if (!config.cas.enabled) error(403, 'CAS is disabled');

		const token = getToken(event);
		if (!token) error(401, 'Unauthorized');

		const { userId } = await getSessionAndUser(token);

		const blob = await event.request.blob();

		return await add(userId, blob);
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

		const content = new Uint8Array(readFileSync(join(config.cas.data, item.hash.toHex())));

		return new Response(content, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${itemId}"`,
			},
		});
	},
});

addRoute({
	path: '/api/users/:id/cas_items',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'users/:id/cas_items'> {
		if (!config.cas.enabled) error(503, 'CAS is disabled');

		const user = await getUser(event.params.id!);
		if (!user) error(404, 'User not found');

		await checkAuth(event, user.id);

		return await database.selectFrom('cas').where('ownerId', '=', user.id).selectAll().execute();
	},
});
