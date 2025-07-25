import type { Result } from '@axium/core/api';
import { getSessionAndUser } from '@axium/server/auth';
import { addConfigDefaults, config } from '@axium/server/config';
import { connect, database, expectedTypes, type Schema } from '@axium/server/database';
import { dirs } from '@axium/server/io';
import { checkAuth, getToken, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { error } from '@sveltejs/kit';
import type { ExpressionBuilder, Generated, Selectable } from 'kysely';
import { createHash } from 'node:crypto';
import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata, StorageLimits, StorageUsage } from './common.js';
import { StorageItemUpdate } from './common.js';
import './polyfills.js';

declare module '@axium/server/database' {
	export interface Schema {
		storage: {
			createdAt: Generated<Date>;
			hash: Uint8Array;
			id: Generated<string>;
			immutable: Generated<boolean>;
			modifiedAt: Generated<Date>;
			name: string;
			parentId: string | null;
			restricted: Generated<boolean>;
			size: number;
			trashedAt: Date | null;
			type: string;
			userId: string;
			publicPermission: Generated<number>;
			metadata: Generated<Record<string, unknown>>;
		};
	}

	export interface ExpectedSchema {
		storage: ColumnTypes<Schema['storage']>;
	}
}

expectedTypes.storage = {
	createdAt: { type: 'timestamptz', required: true, hasDefault: true },
	hash: { type: 'bytea', required: true },
	id: { type: 'uuid', required: true, hasDefault: true },
	immutable: { type: 'bool', required: true, hasDefault: true },
	modifiedAt: { type: 'timestamptz', required: true, hasDefault: true },
	name: { type: 'text' },
	parentId: { type: 'uuid' },
	restricted: { type: 'bool', required: true, hasDefault: true },
	size: { type: 'int4', required: true },
	trashedAt: { type: 'timestampz' },
	type: { type: 'text', required: true },
	userId: { type: 'uuid', required: true, hasDefault: true },
	publicPermission: { type: 'int4', required: true, hasDefault: true },
	metadata: { type: 'jsonb', required: true, hasDefault: true },
};

declare module '@axium/server/config' {
	export interface Config {
		storage: {
			/** Whether the storage API endpoints are enabled */
			enabled: boolean;
			/** Whether the files app is enabled. Requires `enabled` */
			app_enabled: boolean;
			/** Path to data directory */
			data: string;
			/** How many days files are kept in the trash */
			trash_duration: number;
			/** Default limits */
			limits: StorageLimits;
			/** Content Addressable Storage (CAS) configuration */
			cas: {
				/** Whether to use CAS */
				enabled: boolean;
				/** Mime types to include when determining if CAS should be used */
				include: string[];
				/** Mime types to exclude when determining if CAS should be used */
				exclude: string[];
			};
		};
	}
}

const defaultCASMime = [/video\/.*/, /audio\/.*/];

addConfigDefaults({
	storage: {
		enabled: true,
		app_enabled: true,
		data: dirs.at(-1)! + '/storage',
		trash_duration: 30,
		limits: {
			user_size: 1000,
			item_size: 100,
			user_items: 10_000,
		},
		cas: {
			enabled: true,
			include: [],
			exclude: [],
		},
	},
});

export interface StorageItem extends StorageItemMetadata {
	data: Uint8Array<ArrayBufferLike>;
}

export function parseItem<T extends Record<string, unknown> = Record<string, unknown>>(
	item: Selectable<Schema['storage']> & { hash: string }
): StorageItemMetadata<T> {
	return {
		...item,
		metadata: item.metadata as T,
		dataURL: `/raw/storage/${item.id}`,
	};
}

/**
 * Returns the current usage of the storage for a user in bytes.
 */
export async function currentUsage(userId: string): Promise<StorageUsage> {
	connect();
	const result = await database
		.selectFrom('storage')
		.where('userId', '=', userId)
		.select(database.fn.countAll<number>().as('items'))
		.select(eb => eb.fn.sum<number>('size').as('bytes'))
		.executeTakeFirstOrThrow();

	return result;
}

export async function get<T extends Record<string, unknown> = Record<string, unknown>>(itemId: string): Promise<StorageItemMetadata<T>> {
	connect();
	const result = await database
		.selectFrom('storage')
		.where('id', '=', itemId)
		.selectAll()
		.select(withEncodedHash)
		.executeTakeFirstOrThrow();
	return parseItem<T>(result);
}

export function withEncodedHash(eb: ExpressionBuilder<Schema, 'storage'>) {
	return eb.fn<string>('encode', ['hash', eb.val('hex')]).as('hash');
}

export type ExternalLimitHandler = (userId?: string) => StorageLimits | Promise<StorageLimits>;

let _getLimits: ExternalLimitHandler | null = null;

/**
 * Define the handler to get limits for a user externally.
 */
export function useLimits(handler: ExternalLimitHandler): void {
	_getLimits = handler;
}

export async function getLimits(userId?: string): Promise<StorageLimits> {
	try {
		return await _getLimits!(userId);
	} catch {
		return config.storage.limits;
	}
}

addRoute({
	path: '/api/storage/item/:id',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		await checkAuth(event, item.userId);

		return item;
	},
	async PATCH(event): Result<'PATCH', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const body = await parseBody(event, StorageItemUpdate);

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		await checkAuth(event, item.userId);

		const values: Partial<Pick<StorageItemMetadata, 'publicPermission' | 'trashedAt' | 'userId' | 'name'>> = {};
		if ('publicPermission' in body) values.publicPermission = body.publicPermission;
		if ('trash' in body) values.trashedAt = body.trash ? new Date() : null;
		if ('owner' in body) values.userId = body.owner;
		if ('name' in body) values.name = body.name;

		if (!Object.keys(values).length) error(400, 'No valid fields to update');

		return parseItem(
			await database
				.updateTable('storage')
				.where('id', '=', itemId)
				.set(values)
				.returningAll()
				.returning(withEncodedHash)
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update item'))
		);
	},
	async DELETE(event): Result<'DELETE', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		await checkAuth(event, item.userId);

		await database
			.deleteFrom('storage')
			.where('id', '=', itemId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete item'));

		const { count } = await database
			.selectFrom('storage')
			.where('hash', '=', Uint8Array.fromHex(item.hash))
			.select(eb => eb.fn.countAll().as('count'))
			.executeTakeFirstOrThrow();

		if (!Number(count)) unlinkSync(join(config.storage.data, item.hash));

		return item;
	},
});

addRoute({
	path: '/api/storage/directory/:id',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'storage/directory/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		await checkAuth(event, item.userId);

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await database
			.selectFrom('storage')
			.where('parentId', '=', itemId)
			.where('trashedAt', '!=', null)
			.selectAll()
			.select(withEncodedHash)
			.execute();

		return items.map(parseItem);
	},
});

addRoute({
	path: '/raw/storage',
	async PUT(event): Promise<StorageItemMetadata> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const token = getToken(event);
		if (!token) error(401, 'Missing session token');

		const { userId } = await getSessionAndUser(token).catch(withError('Invalid session token', 401));

		const [usage, limits] = await Promise.all([currentUsage(userId), getLimits(userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		const name = event.request.headers.get('x-name');
		if (!name) error(400, 'Missing name header');
		if (name.length > 255) error(400, 'Name is too long');

		const maybeParentId = event.request.headers.get('x-parent');
		const parentId = maybeParentId
			? await z
					.uuid()
					.parseAsync(maybeParentId)
					.catch(() => error(400, 'Invalid parent ID'))
			: null;

		const size = Number(event.request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		if (usage.items >= limits.user_items) error(409, 'Too many items');

		if ((usage.bytes + size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

		if (size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await event.request.bytes();

		// @todo: add this to the audit log
		if (content.byteLength > size) error(400, 'Content length does not match size header');

		const type = event.request.headers.get('content-type') || 'application/octet-stream';

		const useCAS =
			config.storage.cas.enabled &&
			(defaultCASMime.some(pattern => pattern.test(type)) || config.storage.cas.include.some(mime => type.match(mime)));

		const hash = createHash('BLAKE2b512').update(content).digest();

		// @todo: make this atomic

		const result = await database
			.insertInto('storage')
			.values({ userId: userId, hash, name, size, type, immutable: useCAS, parentId })
			.returningAll()
			.returning(withEncodedHash)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not create item'));

		const path = join(config.storage.data, result.id);

		const _noDupe = () => {
			writeFileSync(path, content);
			return parseItem(result);
		};

		if (!useCAS) return _noDupe();

		const existing = await database
			.selectFrom('storage')
			.where('hash', '=', hash)
			.where('id', '!=', result.id)
			.selectAll()
			.executeTakeFirst();

		if (!existing) return _noDupe();

		linkSync(join(config.storage.data, existing.id), path);
		return parseItem(result);
	},
});

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(event) {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		await checkAuth(event, item.userId);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const content = new Uint8Array(readFileSync(join(config.storage.data, item.id)));

		return new Response(content, {
			headers: {
				'Content-Type': item.type,
				'Content-Disposition': `attachment; filename="${item.name}"`,
			},
		});
	},
	async POST(event) {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const item = await get(itemId);
		if (!item) error(404, 'Item not found');

		const { accessor } = await checkAuth(event, item.userId);

		if (item.immutable) error(403, 'Item is immutable');
		if (item.trashedAt) error(410, 'Trashed items can not be changed');
		if (item.userId != accessor.id) error(403, 'Item editing is restricted to the owner');

		const type = event.request.headers.get('content-type') || 'application/octet-stream';

		// @todo: add this to the audit log
		if (type != item.type) error(400, 'Content type does not match existing item type');

		const size = Number(event.request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		const [usage, limits] = await Promise.all([currentUsage(item.userId), getLimits(item.userId)]).catch(
			withError('Could not fetch usage and/or limits')
		);

		if ((usage.bytes + size - item.size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

		if (size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await event.request.bytes();

		// @todo: add this to the audit log
		if (content.byteLength > size) error(400, 'Content length does not match size header');

		const hash = createHash('BLAKE2b512').update(content).digest();

		// @todo: make this atomic

		const result = await database
			.updateTable('storage')
			.where('id', '=', itemId)
			.set({ size, modifiedAt: new Date(), hash })
			.returningAll()
			.returning(withEncodedHash)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update item'));

		await writeFile(join(config.storage.data, result.id), content).catch(withError('Could not write'));

		return parseItem(result);
	},
});

addRoute({
	path: '/api/users/:id/storage',
	params: { id: z.uuid() },
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const userId = event.params.id!;
		await checkAuth(event, userId);

		const [usage, limits] = await Promise.all([currentUsage(userId), getLimits(userId)]).catch(withError('Could not fetch data'));

		return { usage, limits };
	},
	async GET(event): Result<'GET', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const userId = event.params.id!;

		await checkAuth(event, userId);

		const [items, usage, limits] = await Promise.all([
			database.selectFrom('storage').where('userId', '=', userId).selectAll().select(withEncodedHash).execute(),
			currentUsage(userId),
			getLimits(userId),
		]).catch(withError('Could not fetch data'));

		return { usage, limits, items: items.map(parseItem) };
	},
});
