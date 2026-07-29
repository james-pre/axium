import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { contentDispositionFor, error, parseRequestRange } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getEpisode, getMovie } from '../db.js';
import { episodePath, moviePath, resolveMedia } from '../media.js';
import { ID, SeasonNumber } from './metadata.js';

/** `?download` is a bare flag, so it can't go through `parseSearch`, which JSON-parses every value */
function isDownload(req: Request): boolean {
	return new URL(req.url).searchParams.has('download');
}

/**
 * Serve a media file, honoring range requests so the browser can seek without pulling the whole file.
 *
 * `base` is the path without an extension; which file is actually sent depends on what is on disk
 * and on whether this is a download or playback.
 */
function serveMedia(req: Request, base: string, name: string): Response {
	const download = isDownload(req);

	const media = resolveMedia(base, download);
	if (!media) error(404, 'The file for this media is missing');

	// The file on disk is the source of truth; the recorded upload size can be for a different container
	let size: bigint;
	try {
		({ size } = statSync(media.path, { bigint: true }));
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
		'Content-Type': media.type,
		'Content-Disposition': contentDispositionFor(name, media.ext, download ? 'attachment' : 'inline'),
		'Cache-Control': 'private, max-age=3600',
	};

	// Content-Range is only meaningful on a 206
	if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

	const stream = createReadStream(media.path, { start, end });

	// Without this an ENOENT/EACCES after the headers are sent becomes an unhandled 'error' event
	stream.on('error', () => stream.destroy());

	return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}

addRoute({
	path: '/raw/kino/movies/:id',
	params: { id: ID },
	async GET(req, { id }) {
		await requireSession(req);

		const upload = await database.selectFrom('kino_movie_uploads').select('id').where('id', '=', id).executeTakeFirst();

		if (!upload) error(404, 'This movie has not been uploaded');

		const movie = await getMovie(id);

		return serveMedia(req, moviePath(id), movie.title.replaceAll(/[ :/]/g, '_'));
	},
});

addRoute({
	path: '/raw/kino/tv/:id/:season/:episode_number',
	params: { id: ID, season: SeasonNumber, episode_number: ID },
	async GET(req, { id, season, episode_number }) {
		await requireSession(req);

		const upload = await database
			.selectFrom('kino_tv_uploads')
			.select('id')
			.where(eb => eb.and({ id, season_number: season, episode_number }))
			.executeTakeFirst();

		if (!upload) error(404, 'This episode has not been uploaded');

		const episode = await getEpisode(id, season, episode_number);

		return serveMedia(req, episodePath(id, season, episode_number), episode.name.replaceAll(/[ :/]/g, '_'));
	},
});
