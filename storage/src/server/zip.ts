import { getConfig } from '@axium/core';
import { authRequestForItem } from '@axium/server/auth';
import { error } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { Duplex, Readable } from 'node:stream';
import * as z from 'zod';
import '../polyfills.js';
import { getRecursive } from './db.js';
import { _contentDispositionFor } from './raw.js';

addRoute({
	path: '/raw/storage/directory-zip/:id',
	params: { id: z.uuid() },
	async GET(request, { id: itemId }) {
		const config = getConfig('@axium/storage');
		if (!config.enabled) error(503, 'User storage is disabled');

		const { item } = await authRequestForItem(request, 'storage', itemId, { read: true }, true);

		if (item.trashedAt) error(410, 'Trashed items can not be downloaded');

		const stream = new Duplex();

		for await (const child of getRecursive(item.id)) {
			// @todo
		}

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 200,
			headers: {
				/* 'Content-Length': String(length), */
				'Content-Type': item.type,
				'Content-Disposition': _contentDispositionFor(item.name, '.zip'),
			},
		});
	},
});
