import { getConfig, type AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import { KinoDownloadInit, KinoDownloadSelect, type KinoDownloadTarget } from '../../common.js';
import * as downloads from '../downloads.js';

const params = { hash: z.string().regex(/^[0-9a-f]{40}$/) };

function requireEnabled(): void {
	if (!downloads.enabled()) error(503, 'Downloads are disabled');
}

async function isUploaded(target: KinoDownloadTarget): Promise<boolean> {
	if (target.type == 'movie') return !!(await database.selectFrom('kino_movie_uploads').where('id', '=', target.id).executeTakeFirst());

	let query = database.selectFrom('kino_tv_uploads').where('id', '=', target.id).where('season_number', '=', target.season);
	if (target.type == 'episode') query = query.where('episode_number', '=', target.episode);

	return !!(await query.executeTakeFirst());
}

/** Only whoever started a download, or an administrator, can change it */
async function requireDownload(request: Request, hash: string) {
	const session = await requireSession(request);
	requireEnabled();

	const download = downloads.get(hash);
	if (!download) error(404, 'Download not found');

	if (download.row.userId != session.userId && !session.user.isAdmin) error(403, 'This is not your download');

	return download;
}

addRoute({
	path: '/api/kino/downloads',
	async GET(request): AsyncResult<'GET', 'kino/downloads'> {
		await requireSession(request);
		requireEnabled();

		return downloads.list();
	},
	async PUT(request): AsyncResult<'PUT', 'kino/downloads'> {
		const { userId, user } = await requireSession(request);
		requireEnabled();

		const { allow_user_uploads, torrent } = getConfig('@axium/kino');
		if (!allow_user_uploads && !user.isAdmin) error(403, 'Only administrators are allowed to add to the library');
		if (!torrent.allow_user_magnets && !user.isAdmin) error(403, 'Only administrators are allowed to download magnet links');

		const init = await parseBody(request, KinoDownloadInit);

		if (downloads.find(init.target)) error(409, 'This is already being downloaded');
		if (await isUploaded(init.target)) error(409, 'This has already been uploaded');

		return await downloads.start(userId, init).catch(withError('Could not start the download', 400));
	},
});

addRoute({
	path: '/api/kino/downloads/:hash',
	params,
	async DELETE(request, { hash }): AsyncResult<'DELETE', 'kino/downloads/:hash'> {
		const download = await requireDownload(request, hash);

		await download.cancel().catch(withError('Could not cancel the download'));

		return download.toJSON();
	},
});

addRoute({
	path: '/api/kino/downloads/:hash/select',
	params,
	async POST(request, { hash }): AsyncResult<'POST', 'kino/downloads/:hash/select'> {
		const download = await requireDownload(request, hash);

		const { index } = await parseBody(request, KinoDownloadSelect);

		if (download.state != 'selecting') error(409, 'This download is not waiting for a file to be picked');
		if (!download.choose(index)) error(400, 'That file is not one of the choices');

		return download.toJSON();
	},
});
