import type { AsyncResult } from '@axium/core';
import { authSessionForItem, requireSession, type SessionAndUser } from '@axium/server/auth';
import { error, isResponseError, parseBody, parseSearch } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { parseItem } from '@axium/storage/server/db';
import { checkNewItem, createNewItem } from '@axium/storage/server/item';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { EditorOptions, formatOf, NewDocument, newFormats } from '../common.js';
import { editorFor } from './documentserver.js';

async function isAllowed(itemId: string, permissions: { write?: boolean; manage?: boolean }, session: SessionAndUser): Promise<boolean> {
	return await authSessionForItem('storage', itemId, permissions, session, true).then(
		() => true,
		(e: unknown) => {
			if (isResponseError(e) && e.status == 403) return false;
			throw e;
		}
	);
}

/**
 * @todo reduce DB round trips (currently 3)
 */
addRoute({
	path: '/api/office/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'office/:id'> {
		const options = parseSearch(request, EditorOptions);
		const session = await requireSession(request);
		const { item: rawItem } = await authSessionForItem('storage', id, { read: true }, session, true);
		const item = parseItem(rawItem);

		if (item.trashedAt) error(410, 'Trashed items can not be opened');

		const format = formatOf(item);
		if (!format || item.type == 'inode/directory') error(415, 'Office can not open this kind of file');

		const isOwner = item.userId == session.userId;
		const canWrite = !item.immutable && (isOwner || (await isAllowed(id, { write: true }, session)));
		const canRename = isOwner || (await isAllowed(id, { manage: true }, session));

		const editor = editorFor({ item, format, user: session.user, canWrite, options });

		return { item, readOnly: !canWrite, canRename, editor };
	},
});

const assets = join(import.meta.dirname, '../../assets/');

addRoute({
	path: '/api/office',
	async PUT(request): AsyncResult<'PUT', 'office'> {
		const { kind, name, parentId } = await parseBody(request, NewDocument);
		const session = await requireSession(request);

		const format = newFormats[kind];
		const content = readFileSync(join(assets, `blank.${format.extension}`));

		const init = {
			name: `${name}.${format.extension}`,
			size: BigInt(content.byteLength),
			type: format.type,
			parentId,
			hash: createHash('BLAKE2b512').update(content).digest('hex'),
		};

		await checkNewItem(init, session);
		return await createNewItem(init, session.userId, path => writeFileSync(path, content));
	},
});
