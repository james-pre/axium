import type { AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import type { KinoUpload } from '../../common.js';
import { getEpisode, getMovie, getSeason, getTv } from '../db.js';

export const ID = z.coerce.number().int().positive();

/** Specials are season 0, so season numbers may be zero */
export const SeasonNumber = z.coerce.number().int().nonnegative();

const params = { id: ID };

/** The columns of `kino_*_uploads` that are exposed to clients */
const uploadColumns = ['uploadedAt', 'name', 'size', 'type'] as const satisfies (keyof KinoUpload)[];

addRoute({
	path: '/api/kino/movies',
	async GET(req): AsyncResult<'GET', 'kino/movies'> {
		await requireSession(req);

		const rows = await database
			.selectFrom('kino_movies')
			.innerJoin('kino_movie_uploads', 'kino_movie_uploads.id', 'kino_movies.id')
			.selectAll('kino_movies')
			.select(uploadColumns.map(column => `kino_movie_uploads.${column}` as const))
			.orderBy('kino_movies.title')
			.execute();

		return rows.map(({ uploadedAt, name, size, type, ...movie }) => ({ ...movie, upload: { uploadedAt, name, size, type } }));
	},
});

addRoute({
	path: '/api/kino/movies/:id',
	params,
	async GET(req, { id }): AsyncResult<'GET', 'kino/movies/:id'> {
		await requireSession(req);

		const [movie, upload] = await Promise.all([
			getMovie(id),
			database.selectFrom('kino_movie_uploads').select(uploadColumns).where('id', '=', id).executeTakeFirst(),
		]);

		return { ...movie, upload };
	},
});

addRoute({
	path: '/api/kino/tv',
	async GET(req): AsyncResult<'GET', 'kino/tv'> {
		await requireSession(req);

		// Only shows with at least one uploaded episode
		return await database
			.selectFrom('kino_tv')
			.selectAll()
			.where(eb =>
				eb.exists(eb.selectFrom('kino_tv_uploads').select('kino_tv_uploads.id').whereRef('kino_tv_uploads.id', '=', 'kino_tv.id'))
			)
			.orderBy('name')
			.execute();
	},
});

addRoute({
	path: '/api/kino/tv/:id',
	params,
	async GET(req, { id }) {
		await requireSession(req);
		return await getTv(id);
	},
});

addRoute({
	path: '/api/kino/tv/:id/season/:season',
	params: { id: ID, season: SeasonNumber },
	async GET(req, { id, season }): AsyncResult<'GET', 'kino/tv/:id/season/:season'> {
		await requireSession(req);

		const data = await getSeason(id, season);

		if (!data.episodes?.length) return data;

		const uploads = await database
			.selectFrom('kino_tv_uploads')
			.select(['episode_number', ...uploadColumns])
			.where(eb => eb.and({ id, season_number: season }))
			.execute();

		const byEpisode = new Map(uploads.map(({ episode_number, ...upload }) => [episode_number, upload]));

		return { ...data, episodes: data.episodes.map(episode => ({ ...episode, upload: byEpisode.get(episode.episode_number) })) };
	},
});

addRoute({
	path: '/api/kino/tv/:id/season/:season/episode/:episode',
	params: { id: ID, season: SeasonNumber, episode: ID },
	async GET(req, { id, season, episode }): AsyncResult<'GET', 'kino/tv/:id/season/:season/episode/:episode'> {
		await requireSession(req);

		const [data, upload] = await Promise.all([
			getEpisode(id, season, episode),
			database
				.selectFrom('kino_tv_uploads')
				.select(uploadColumns)
				.where(eb => eb.and({ id, season_number: season, episode_number: episode }))
				.executeTakeFirst(),
		]);

		return { ...data, upload };
	},
});
