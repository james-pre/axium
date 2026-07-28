import { getConfig } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { contentDispositionFor, error, parseRequestRange } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { getEpisode, getMovie } from '../db.js';
import { ID } from './metadata.js';

addRoute({
	path: '/raw/kino/movies/:id',
	params: { id: ID },
	async GET(req, { id }) {
		await requireSession(req);

		const upload = await database.selectFrom('kino_movie_uploads').selectAll().where('id', '=', id).executeTakeFirst();

		if (!upload) error(404, 'This movie has not been uploaded');

		const { data_dir } = getConfig('@axium/kino');

		const movie = await getMovie(id);

		const range = req.headers.get('range');

		const { start, end, length } = parseRequestRange(upload.size, range);

		if (start >= upload.size || end >= upload.size || start > end || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${upload.size}` },
			});
		}

		const path = join(data_dir, 'movie', id + '.mkv');
		const content = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;

		return new Response(content, {
			status: range ? 206 : 200,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${upload.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(length),
				'Content-Type': upload.type,
				'Content-Disposition': contentDispositionFor(movie.title.replaceAll(/[ :/]/g, '_')),
			},
		});
	},
});

addRoute({
	path: '/raw/kino/tv/:id/:season/:episode_number',
	params: { id: ID, season: ID, episode_number: ID },
	async GET(req, { id, season, episode_number }) {
		await requireSession(req);

		const upload = await database
			.selectFrom('kino_tv_uploads')
			.selectAll()
			.where(eb =>
				eb.and({
					id,
					season_number: season,
					episode_number,
				})
			)
			.executeTakeFirst();

		if (!upload) error(404, 'This episode has not been uploaded');

		const { data_dir } = getConfig('@axium/kino');

		const episode = await getEpisode(id, season, episode_number);

		const range = req.headers.get('range');

		const { start, end, length } = parseRequestRange(upload.size, range);

		if (start >= upload.size || end >= upload.size || start > end || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${upload.size}` },
			});
		}

		const path = join(data_dir, 'tv', season.toString(), episode_number.toString() + '.mkv');
		const content = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;

		return new Response(content, {
			status: range ? 206 : 200,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${upload.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(length),
				'Content-Type': upload.type,
				'Content-Disposition': contentDispositionFor(episode.name.replaceAll(/[ :/]/g, '_')),
			},
		});
	},
});
