import { getConfig } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { contentDispositionFor, error, parseRequestRange } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { getEpisode, getMovie } from '../db.js';
import { ID, SeasonNumber } from './metadata.js';

/**
 * Serve a media file, honoring range requests so the browser can seek without pulling the whole file.
 * `size` comes from the upload record; the file on disk is the source of truth if they ever disagree.
 */
function serveMedia(req: Request, path: string, type: string, name: string): Response {
	let size: bigint;
	try {
		({ size } = statSync(path, { bigint: true }));
	} catch {
		error(404, 'The file for this media is missing');
	}

	const range = req.headers.get('range');

	const parsed = parseRequestRange(size, range);
	const { start } = parsed;

	/**
	 * RFC 9110 requires a last-byte-pos at or past the end to mean "the rest of the representation",
	 * so clamp instead of rejecting. Firefox and Safari both send such ranges while probing.
	 */
	const end = Math.min(parsed.end, Number(size) - 1);

	if (start < 0 || start > end || start >= size) {
		return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
	}

	const headers: HeadersInit = {
		'Accept-Ranges': 'bytes',
		'Content-Length': String(end - start + 1),
		'Content-Type': type,
		'Content-Disposition': contentDispositionFor(name, '.mkv', 'inline'),
		'Cache-Control': 'private, max-age=3600',
	};

	// Content-Range is only meaningful on a 206
	if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

	const stream = createReadStream(path, { start, end });

	// Without this an ENOENT/EACCES after the headers are sent becomes an unhandled 'error' event
	stream.on('error', () => stream.destroy());

	return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}

addRoute({
	path: '/raw/kino/movies/:id',
	params: { id: ID },
	async GET(req, { id }) {
		await requireSession(req);

		const upload = await database.selectFrom('kino_movie_uploads').selectAll().where('id', '=', id).executeTakeFirst();

		if (!upload) error(404, 'This movie has not been uploaded');

		const { data_dir } = getConfig('@axium/kino');
		const movie = await getMovie(id);

		return serveMedia(req, join(data_dir, 'movie', id + '.mkv'), upload.type, movie.title.replaceAll(/[ :/]/g, '_'));
	},
});

addRoute({
	path: '/raw/kino/tv/:id/:season/:episode_number',
	params: { id: ID, season: SeasonNumber, episode_number: ID },
	async GET(req, { id, season, episode_number }) {
		await requireSession(req);

		const upload = await database
			.selectFrom('kino_tv_uploads')
			.selectAll()
			.where(eb => eb.and({ id, season_number: season, episode_number }))
			.executeTakeFirst();

		if (!upload) error(404, 'This episode has not been uploaded');

		const { data_dir } = getConfig('@axium/kino');
		const episode = await getEpisode(id, season, episode_number);

		const path = join(data_dir, 'tv', id.toString(), season.toString(), episode_number + '.mkv');

		return serveMedia(req, path, upload.type, episode.name.replaceAll(/[ :/]/g, '_'));
	},
});
