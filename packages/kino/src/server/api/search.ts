import type { AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as io from 'ioium/node';
import * as kt from 'kinotool';
import { KinoSearchQuery, type KinoSearchResults } from '../../common.js';
import { tmdb } from '../tmdb.js';

/**
 * Whether TMDB search results are persisted.
 * @todo Replace with the config option
 */
const __cache_aggressive__ = true;

/** Maximum number of results to pull from the database */
const localLimit = 20;

/** Escape a user-provided string for use as an `ILIKE` pattern */
function escapeLike(text: string): string {
	return text.replaceAll(/[\\%_]/g, char => '\\' + char);
}

addRoute({
	path: '/api/kino/search',
	async POST(req): AsyncResult<'POST', 'kino/search'> {
		await requireSession(req);

		const { query, type } = await parseBody(req, KinoSearchQuery);

		const pattern = `%${escapeLike(query)}%`;

		const [movies, shows, multi] = await Promise.all([
			type == 'tv'
				? []
				: database
						.selectFrom('kino_movies')
						.selectAll()
						.where('title', 'ilike', pattern)
						.orderBy('title')
						.limit(localLimit)
						.execute(),
			type == 'movie'
				? []
				: database.selectFrom('kino_tv').selectAll().where('name', 'ilike', pattern).orderBy('name').limit(localLimit).execute(),
			tmdb()
				.search.multi({ query, language: 'en-US', page: 1, include_adult: true })
				.then(({ results }) => results)
				.catch(e => {
					io.warn('Kino: TMDB search failed: ' + io.errorText(e));
					return [];
				}),
		]);

		const results: KinoSearchResults = [];
		const seen = new Set<string>();

		// Local results come first since media that has actually been uploaded is the most likely target
		for (const movie of movies) {
			seen.add('movie:' + movie.id);
			results.push({ ...movie, type: 'movie' });
		}

		for (const show of shows) {
			seen.add('tv:' + show.id);
			results.push({ ...show, type: 'tv' });
		}

		const newMovies: kt.Movie[] = [],
			newShows: kt.Tv[] = [];

		for (const result of multi) {
			if (result.media_type == 'person') continue;
			if (type && result.media_type != type) continue;

			const key = `${result.media_type}:${result.id}`;
			if (seen.has(key)) continue;

			/**
			 * TMDB returns incomplete entries, e.g. an empty `release_date` for unannounced titles.
			 * Skip those instead of failing the entire search.
			 */
			if (result.media_type == 'movie') {
				const parsed = kt.Movie.safeParse(result);
				if (!parsed.success) continue;
				newMovies.push(parsed.data);
				results.push({ ...parsed.data, type: 'movie' });
			} else {
				const parsed = kt.Tv.safeParse(result);
				if (!parsed.success) continue;
				newShows.push(parsed.data);
				results.push({ ...parsed.data, type: 'tv' });
			}

			seen.add(key);
		}

		if (__cache_aggressive__) {
			try {
				if (newMovies.length)
					await database
						.insertInto('kino_movies')
						.values(newMovies)
						.onConflict(oc => oc.doNothing())
						.execute();

				if (newShows.length)
					await database
						.insertInto('kino_tv')
						.values(newShows)
						.onConflict(oc => oc.doNothing())
						.execute();
			} catch (e) {
				io.warn('Kino: failed to cache search results: ' + io.errorText(e));
			}
		}

		return results;
	},
});
