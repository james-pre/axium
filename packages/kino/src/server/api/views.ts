import type { AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody, parseSearch } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { KinoView } from '../../common.js';
import { KinoViewFilter, KinoViewInit } from '../../common.js';
import { getEpisode, getMovie, getTv } from '../db.js';

/** How many recently watched items the home page shows */
const defaultLimit = 12;

addRoute({
	path: '/api/kino/views',
	async GET(req): AsyncResult<'GET', 'kino/views'> {
		const { userId } = await requireSession(req);

		const { limit = defaultLimit, type, id, season } = parseSearch(req, KinoViewFilter);

		/** A show takes a single slot however many of its episodes were watched, unless the caller asked about that show */
		const dedupe = id === undefined;

		/**
		 * Only cached rows are joined in — a recently watched list should never fan out into TMDB requests.
		 * Anything whose metadata has since been removed simply drops off the list.
		 */
		const [movies, episodes] = await Promise.all([
			// A season only ever narrows down to episodes, so asking for one rules movies out
			type == 'tv' || season !== undefined
				? []
				: database
						.selectFrom('kino_movie_views')
						.innerJoin('kino_movies', 'kino_movies.id', 'kino_movie_views.id')
						.innerJoin('kino_movie_uploads', 'kino_movie_uploads.id', 'kino_movie_views.id')
						.selectAll('kino_movies')
						.select(['kino_movie_views.viewedAt', 'kino_movie_views.position', 'kino_movie_views.duration'])
						.select(['kino_movie_uploads.uploadedAt', 'kino_movie_uploads.name as uploadName'])
						.select(['kino_movie_uploads.size', 'kino_movie_uploads.type'])
						.where('kino_movie_views.userId', '=', userId)
						.$if(id !== undefined, qb => qb.where('kino_movie_views.id', '=', id!))
						.orderBy('kino_movie_views.viewedAt', 'desc')
						.limit(limit)
						.execute(),
			type == 'movie'
				? []
				: database
						.selectFrom('kino_tv_views')
						.innerJoin('kino_tv', 'kino_tv.id', 'kino_tv_views.id')
						.innerJoin('kino_episodes', join =>
							join
								.onRef('kino_episodes.id', '=', 'kino_tv_views.id')
								.onRef('kino_episodes.season_number', '=', 'kino_tv_views.season_number')
								.onRef('kino_episodes.episode_number', '=', 'kino_tv_views.episode_number')
						)
						.select(['kino_tv_views.viewedAt', 'kino_tv_views.position', 'kino_tv_views.duration'])
						.select(eb => [
							eb.ref('kino_episodes.season_number').as('season_number'),
							eb.ref('kino_episodes.episode_number').as('episode_number'),
							eb.ref('kino_episodes.name').as('episode_name'),
							eb.ref('kino_episodes.air_date').as('air_date'),
							eb.ref('kino_episodes.still_path').as('still_path'),
						])
						.select(eb => [
							eb.ref('kino_tv.id').as('showId'),
							eb.ref('kino_tv.name').as('showName'),
							eb.ref('kino_tv.overview').as('overview'),
							eb.ref('kino_tv.first_air_date').as('first_air_date'),
							eb.ref('kino_tv.adult').as('adult'),
							eb.ref('kino_tv.poster_path').as('poster_path'),
							eb.ref('kino_tv.backdrop_path').as('backdrop_path'),
						])
						.where('kino_tv_views.userId', '=', userId)
						.$if(id !== undefined, qb => qb.where('kino_tv_views.id', '=', id!))
						.$if(season !== undefined, qb => qb.where('kino_tv_views.season_number', '=', season!))
						.orderBy('kino_tv_views.viewedAt', 'desc')
						// Only one row per show survives the dedupe below, so fetch extra to avoid a short list
						.limit(dedupe ? limit * 4 : limit)
						.execute(),
		]);

		const seenShows = new Set<number>();
		const latestPerShow = dedupe ? episodes.filter(row => !seenShows.has(row.showId) && seenShows.add(row.showId)) : episodes;

		const views: KinoView[] = [
			...movies.map(({ viewedAt, position, duration, uploadedAt, uploadName, size, type, ...movie }) => ({
				type: 'movie' as const,
				viewedAt,
				position,
				duration,
				movie: { ...movie, upload: { uploadedAt, name: uploadName, size, type } },
			})),
			...latestPerShow.map(row => ({
				type: 'tv' as const,
				viewedAt: row.viewedAt,
				position: row.position,
				duration: row.duration,
				show: {
					id: row.showId,
					name: row.showName,
					overview: row.overview,
					first_air_date: row.first_air_date,
					adult: row.adult,
					poster_path: row.poster_path,
					backdrop_path: row.backdrop_path,
				},
				episode: {
					id: row.showId,
					season_number: row.season_number,
					episode_number: row.episode_number,
					name: row.episode_name,
					air_date: row.air_date,
					still_path: row.still_path,
				},
			})),
		];

		// Both queries are capped at `limit`, so the merged list has to be trimmed again
		return views.sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime()).slice(0, limit);
	},

	async PUT(req): AsyncResult<'PUT', 'kino/views'> {
		const { userId } = await requireSession(req);

		const init = await parseBody(req, KinoViewInit);

		const viewedAt = new Date();
		const { position, duration } = init;

		// The player sends this repeatedly while watching, so an existing row is updated in place
		const progress = { viewedAt, position, duration: duration ?? null };

		if (init.type == 'movie') {
			const movie = await getMovie(init.id);

			await database
				.insertInto('kino_movie_views')
				.values({ userId, id: init.id, ...progress })
				.onConflict(b => b.columns(['userId', 'id']).doUpdateSet(progress))
				.execute();

			const upload = await database
				.selectFrom('kino_movie_uploads')
				.select(['uploadedAt', 'name', 'size', 'type'])
				.where('id', '=', init.id)
				.executeTakeFirst();

			return { type: 'movie', ...progress, movie: { ...movie, upload } };
		}

		const [show, episode] = await Promise.all([getTv(init.id), getEpisode(init.id, init.season, init.episode)]);

		await database
			.insertInto('kino_tv_views')
			.values({ userId, id: init.id, season_number: init.season, episode_number: init.episode, ...progress })
			.onConflict(b => b.columns(['userId', 'id', 'season_number', 'episode_number']).doUpdateSet(progress))
			.execute();

		const upload = await database
			.selectFrom('kino_tv_uploads')
			.select(['uploadedAt', 'name', 'size', 'type'])
			.where(eb => eb.and({ id: init.id, season_number: init.season, episode_number: init.episode }))
			.executeTakeFirst();

		return { type: 'tv', ...progress, show, episode: { ...episode, upload } };
	},
});
