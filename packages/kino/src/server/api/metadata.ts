import type { AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as io from 'ioium/node';
import * as z from 'zod';
import type { KinoUpload } from '../../common.js';
import { getEpisode, getMovie, getSeason, getTv } from '../db.js';
import { episodePath, moviePath, removeMedia } from '../media.js';

/**
 * Deleting an upload throws away data for everyone, so it is restricted to administrators
 * regardless of `allow_user_uploads`.
 */
async function requireAdmin(req: Request): Promise<void> {
	const session = await requireSession(req);
	if (!session.user.isAdmin) error(403, 'Only administrators can delete uploads');
}

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

	async DELETE(req, { id }): AsyncResult<'DELETE', 'kino/movies/:id'> {
		await requireAdmin(req);

		const upload = await database.deleteFrom('kino_movie_uploads').where('id', '=', id).returning(uploadColumns).executeTakeFirst();

		if (!upload) error(404, 'This movie has not been uploaded');

		// The row is gone either way; a file we can't remove would only waste space
		const removed = removeMedia(moviePath(id));
		io.info(`Kino: deleted movie ${id} (${removed.length} file(s))`);

		// Progress against something nobody can watch anymore is meaningless
		await database.deleteFrom('kino_movie_views').where('id', '=', id).execute();

		return upload;
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
		const { userId } = await requireSession(req);

		const data = await getSeason(id, season);

		if (!data.episodes?.length) return data;

		const [uploads, views] = await Promise.all([
			database
				.selectFrom('kino_tv_uploads')
				.select(['episode_number', ...uploadColumns])
				.where(eb => eb.and({ id, season_number: season }))
				.execute(),
			// Progress is per-user, so the episode list shows the requester's own position
			database
				.selectFrom('kino_tv_views')
				.select(['episode_number', 'position', 'duration'])
				.where(eb => eb.and({ userId, id, season_number: season }))
				.execute(),
		]);

		const uploadFor = new Map(uploads.map(({ episode_number, ...upload }) => [episode_number, upload]));
		const progressFor = new Map(views.map(({ episode_number, ...progress }) => [episode_number, progress]));

		return {
			...data,
			episodes: data.episodes.map(episode => ({
				...episode,
				upload: uploadFor.get(episode.episode_number),
				progress: progressFor.get(episode.episode_number),
			})),
		};
	},
});

addRoute({
	path: '/api/kino/tv/:id/season/:season/episode/:episode',
	params: { id: ID, season: SeasonNumber, episode: ID },
	async GET(req, { id, season, episode }): AsyncResult<'GET', 'kino/tv/:id/season/:season/episode/:episode'> {
		const { userId } = await requireSession(req);

		const [data, upload, progress] = await Promise.all([
			getEpisode(id, season, episode),
			database
				.selectFrom('kino_tv_uploads')
				.select(uploadColumns)
				.where(eb => eb.and({ id, season_number: season, episode_number: episode }))
				.executeTakeFirst(),
			database
				.selectFrom('kino_tv_views')
				.select(['position', 'duration'])
				.where(eb => eb.and({ userId, id, season_number: season, episode_number: episode }))
				.executeTakeFirst(),
		]);

		return { ...data, upload, progress };
	},

	async DELETE(req, { id, season, episode }): AsyncResult<'DELETE', 'kino/tv/:id/season/:season/episode/:episode'> {
		await requireAdmin(req);

		const upload = await database
			.deleteFrom('kino_tv_uploads')
			.where(eb => eb.and({ id, season_number: season, episode_number: episode }))
			.returning(uploadColumns)
			.executeTakeFirst();

		if (!upload) error(404, 'This episode has not been uploaded');

		const removed = removeMedia(episodePath(id, season, episode));
		io.info(`Kino: deleted episode ${id} S${season}E${episode} (${removed.length} file(s))`);

		await database
			.deleteFrom('kino_tv_views')
			.where(eb => eb.and({ id, season_number: season, episode_number: episode }))
			.execute();

		return upload;
	},
});
