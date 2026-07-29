import { getConfig, type Result } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, json, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { UploadManager } from '@axium/server/uploads';
import * as kt from 'kinotool';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { omit, pick } from 'utilium';
import { KinoMovieUploadInit, KinoTvUploadInit } from '../../common.js';
import { getEpisode, getMovie } from '../db.js';
import { applyMetadata, episodePath, extensionForType, moviePath, remuxUpload } from '../media.js';
import { tmdb } from '../tmdb.js';
import { ID } from './metadata.js';

const movieUploads = new UploadManager<KinoMovieUploadInit, kt.Movie>(() => getConfig('@axium/kino').upload);

addRoute({
	path: '/api/kino/movies/upload',
	async PUT(request): Promise<Response> {
		const session = await requireSession(request);

		const { allow_user_uploads } = getConfig('@axium/kino');
		if (!allow_user_uploads && !session.user.isAdmin) error(403, 'Only administrators are allowed to upload movies');

		const init = await parseBody(request, KinoMovieUploadInit);

		if (!extensionForType(init.type)) error(415, 'Only mkv and mp4 files are supported');

		let movie: kt.Movie | null,
			id = init.id;

		if (!id) {
			const { title, year } = kt.parseTitle(init.name);
			const {
				results: [movieInit],
			} = await tmdb().search.movies({ query: title, year, include_adult: true });
			if (!movieInit) error(406, 'Could not determine a matching movie');

			movie = kt.Movie.parse(movieInit);
			id = movie.id;
		}

		movie ||= await getMovie(id);

		const existing = await database.selectFrom('kino_movie_uploads').where('id', '=', id).executeTakeFirst();
		if (existing) error(409, 'Movie already uploaded');

		return json(
			{
				max_transfer_size: 100,
				movie,
				token: movieUploads.start(init, session, movie),
			} satisfies Result<'PUT', 'kino/movies/upload'>,
			{ status: 202 }
		);
	},
});

movieUploads.addEndpoint('/raw/kino/movies/upload', async upload => {
	const base = moviePath(upload.data.id);
	const ext = extensionForType(upload.init.type)!; // already checked when the upload was started

	const tx = await database.startTransaction().execute();

	try {
		mkdirSync(dirname(base), { recursive: true });

		const item = await tx
			.insertInto('kino_movie_uploads')
			.values({ ...upload.init, id: upload.data.id, hash: upload.hash })
			.returningAll()
			.executeTakeFirstOrThrow();

		upload.writeTo(base + ext);

		await applyMetadata(base + ext, ext, upload.data);

		await tx.commit().execute();

		// Runs in the background; until it finishes the original is served
		remuxUpload(base);

		return item;
	} catch (error: any) {
		await tx.rollback().execute();
		throw withError('Could not upload movie', 500)(error);
	}
});

const tvUploads = new UploadManager<KinoTvUploadInit, kt.Episode>(() => getConfig('@axium/kino').upload);

addRoute({
	path: '/api/kino/tv/:id/upload',
	params: { id: ID },
	async PUT(request, { id }): Promise<Response> {
		const session = await requireSession(request);

		const { allow_user_uploads } = getConfig('@axium/kino');
		if (!allow_user_uploads && !session.user.isAdmin) error(403, 'Only administrators are allowed to upload TV shows');

		const init = await parseBody(request, KinoTvUploadInit);

		if (!extensionForType(init.type)) error(415, 'Only mkv and mp4 files are supported');

		const episode = await getEpisode(id, init.season, init.episode);

		const existing = await database
			.selectFrom('kino_tv_uploads')
			.where(eb => eb.and({ id, season_number: init.season, episode_number: init.episode }))
			.executeTakeFirst();
		if (existing) error(409, 'TV episode already uploaded');

		return json(
			{
				max_transfer_size: 100,
				episode,
				token: tvUploads.start(init, session, episode),
			} satisfies Result<'PUT', 'kino/tv/:id/upload'>,
			{ status: 202 }
		);
	},
});

tvUploads.addEndpoint('/raw/kino/tv/:id/upload', async upload => {
	const { id, season_number, episode_number } = upload.data;

	const base = episodePath(id, season_number, episode_number);
	const ext = extensionForType(upload.init.type)!;

	const tx = await database.startTransaction().execute();

	try {
		const item = await tx
			.insertInto('kino_tv_uploads')
			.values({
				...omit(upload.init, 'season', 'episode'),
				...pick(upload.data, 'id', 'season_number', 'episode_number'),
				hash: upload.hash,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		mkdirSync(dirname(base), { recursive: true });

		upload.writeTo(base + ext);

		await applyMetadata(base + ext, ext, upload.data);

		await tx.commit().execute();

		remuxUpload(base);

		return item;
	} catch (error: any) {
		await tx.rollback().execute();
		throw withError('Could not upload tv episode', 500)(error);
	}
});
