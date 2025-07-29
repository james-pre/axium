import { Permission } from '@axium/core/access';
import type { Result } from '@axium/core/api';
import { checkAuthForItem, checkAuthForUser, getSessionAndUser } from '@axium/server/auth';
import { addConfigDefaults, config } from '@axium/server/config';
import { database, expectedTypes, type Schema } from '@axium/server/database';
import { dirs } from '@axium/server/io';
import { error, getToken, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { Generated, Selectable } from 'kysely';
import { createHash } from 'node:crypto';
import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path/posix';
import * as z from 'zod';
import type { StorageItemMetadata, StorageLimits, StorageUsage } from './common.js';
import { StorageItemUpdate } from './common.js';
import './polyfills.js';

declare module '@axium/server/database' {
	export interface Schema {
		storage: {
			createdAt: Generated<Date>;
			hash: Uint8Array | null;
			id: Generated<string>;
			immutable: Generated<boolean>;
			modifiedAt: Generated<Date>;
			name: string;
			parentId: string | null;
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

/**
 * @internal A storage item selected from the database.
 */
interface SelectedItem extends Selectable<Schema['storage']> {}

expectedTypes.storage = {
	createdAt: { type: 'timestamptz', required: true, hasDefault: true },
	hash: { type: 'bytea' },
	id: { type: 'uuid', required: true, hasDefault: true },
	immutable: { type: 'bool', required: true },
	modifiedAt: { type: 'timestamptz', required: true, hasDefault: true },
	name: { type: 'text' },
	parentId: { type: 'uuid' },
	size: { type: 'int4', required: true },
	trashedAt: { type: 'timestamptz' },
	type: { type: 'text', required: true },
	userId: { type: 'uuid', required: true },
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

export function parseItem<T extends SelectedItem>(item: T): Omit<T, keyof Schema['storage']> & StorageItemMetadata {
	return {
		...item,
		dataURL: `/raw/storage/${item.id}`,
		hash: item.hash?.toHex(),
	};
}

/**
 * Returns the current usage of the storage for a user in bytes.
 */
export async function currentUsage(userId: string): Promise<StorageUsage> {
	const result = await database
		.selectFrom('storage')
		.where('userId', '=', userId)
		.select(eb => eb.fn.countAll<number>().as('items'))
		.select(eb => eb.fn.sum<number>('size').as('bytes'))
		.executeTakeFirstOrThrow();

	result.bytes ||= 0;

	return result;
}

export async function get(itemId: string): Promise<StorageItemMetadata> {
	const result = await database
		.selectFrom('storage')
		.where('id', '=', itemId)
		.selectAll()
		.$narrowType<{ metadata: any }>()
		.executeTakeFirstOrThrow();
	return parseItem(result);
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

		const { item } = await checkAuthForItem<SelectedItem>(event, 'storage', itemId, Permission.Read);

		return parseItem(item);
	},
	async PATCH(event): Result<'PATCH', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const body = await parseBody(event, StorageItemUpdate);

		await checkAuthForItem(event, 'storage', itemId, Permission.Manage);

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
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update item'))
		);
	},
	async DELETE(event): Result<'DELETE', 'storage/item/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const auth = await checkAuthForItem<SelectedItem>(event, 'storage', itemId, Permission.Manage);
		const item = parseItem(auth.item);

		await database
			.deleteFrom('storage')
			.where('id', '=', itemId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete item'));

		if (item.type == 'inode/directory') return item;

		const { count } = await database
			.selectFrom('storage')
			.where('hash', '=', Uint8Array.fromHex(item.hash!))
			.select(eb => eb.fn.countAll().as('count'))
			.executeTakeFirstOrThrow();

		if (!Number(count)) unlinkSync(join(config.storage.data, item.hash!));

		return item;
	},
});

addRoute({
	path: '/api/storage/directory/:id',
	params: { id: z.uuid() },
	async GET(event): Result<'GET', 'storage/directory/:id'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const { item } = await checkAuthForItem<SelectedItem>(event, 'storage', itemId, Permission.Read);

		if (item.type != 'inode/directory') error(409, 'Item is not a directory');

		const items = await database
			.selectFrom('storage')
			.where('parentId', '=', itemId)
			.where('trashedAt', '!=', null)
			.selectAll()
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

		if (parentId) await checkAuthForItem(event, 'storage', parentId, Permission.Edit);

		const size = Number(event.request.headers.get('content-length'));
		if (Number.isNaN(size)) error(411, 'Missing or invalid content length header');

		if (usage.items >= limits.user_items) error(409, 'Too many items');

		if ((usage.bytes + size) / 1_000_000 >= limits.user_size) error(413, 'Not enough space');

		if (size > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

		const content = await event.request.bytes();

		// @todo: add this to the audit log
		if (content.byteLength > size) error(400, 'Content length does not match size header');

		const type = event.request.headers.get('content-type') || 'application/octet-stream';
		const isDirectory = type == 'inode/directory';

		if (isDirectory && size > 0) error(400, 'Directories can not have content');

		const useCAS =
			config.storage.cas.enabled &&
			!isDirectory &&
			(defaultCASMime.some(pattern => pattern.test(type)) || config.storage.cas.include.some(mime => type.match(mime)));

		const hash = isDirectory ? null : createHash('BLAKE2b512').update(content).digest();

		const tx = await database.startTransaction().execute();

		try {
			const item = parseItem(
				await tx
					.insertInto('storage')
					.values({ userId, hash, name, size, type, immutable: useCAS, parentId })
					.returningAll()
					.executeTakeFirstOrThrow()
			);

			const path = join(config.storage.data, item.id);

			if (!useCAS) {
				if (!isDirectory) writeFileSync(path, content);
				await tx.commit().execute();
				return item;
			}

			const existing = await tx
				.selectFrom('storage')
				.select('id')
				.where('hash', '=', hash)
				.where('id', '!=', item.id)
				.limit(1)
				.executeTakeFirst();

			if (!existing) {
				if (!isDirectory) writeFileSync(path, content);
				await tx.commit().execute();
				return item;
			}

			linkSync(join(config.storage.data, existing.id), path);
			await tx.commit().execute();
			return item;
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not create item', 500)(error);
		}
	},
});

addRoute({
	path: '/raw/storage/:id',
	params: { id: z.uuid() },
	async GET(event) {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const itemId = event.params.id!;

		const { item } = await checkAuthForItem<SelectedItem>(event, 'storage', itemId, Permission.Read);

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

		const { item } = await checkAuthForItem<SelectedItem>(event, 'storage', itemId, Permission.Edit);

		if (item.immutable) error(405, 'Item is immutable');
		if (item.type == 'inode/directory') error(409, 'Directories do not have content');
		if (item.trashedAt) error(410, 'Trashed items can not be changed');

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

		const tx = await database.startTransaction().execute();

		try {
			const result = await tx
				.updateTable('storage')
				.where('id', '=', itemId)
				.set({ size, modifiedAt: new Date(), hash })
				.returningAll()
				.executeTakeFirstOrThrow();

			writeFileSync(join(config.storage.data, result.id), content);

			await tx.commit().execute();
			return parseItem(result);
		} catch (error: any) {
			await tx.rollback().execute();
			throw withError('Could not update item', 500)(error);
		}
	},
});

addRoute({
	path: '/api/users/:id/storage',
	params: { id: z.uuid() },
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const userId = event.params.id!;
		await checkAuthForUser(event, userId);

		const [usage, limits] = await Promise.all([currentUsage(userId), getLimits(userId)]).catch(withError('Could not fetch data'));

		return { usage, limits };
	},
	async GET(event): Result<'GET', 'users/:id/storage'> {
		if (!config.storage.enabled) error(503, 'User storage is disabled');

		const userId = event.params.id!;

		await checkAuthForUser(event, userId);

		const [items, usage, limits] = await Promise.all([
			database.selectFrom('storage').where('userId', '=', userId).selectAll().execute(),
			currentUsage(userId),
			getLimits(userId),
		]).catch(withError('Could not fetch data'));

		return { usage, limits, items: items.map(parseItem) };
	},
});
