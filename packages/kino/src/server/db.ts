import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import * as kt from 'kinotool';
import type { AliasedRawBuilder, ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { omit } from 'utilium';
import type schema from '../../db.json';
import { tmdb } from './tmdb.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

export async function getMovie(id: number): Promise<kt.Movie> {
	const result = await database.selectFrom('kino_movies').where('id', '=', id).selectAll().executeTakeFirst();
	if (result) return result;
	const movie = await tmdb().movies.details(id).then(kt.Movie.parse);
	await database.insertInto('kino_movies').values(movie).returningAll().executeTakeFirstOrThrow();
	return movie;
}

/** Seasons are stored in their own table, so pull them in alongside the show */
function withSeasons(eb: ExpressionBuilder<Schema, 'kino_tv'>): AliasedRawBuilder<kt.Season[], 'seasons'> {
	return jsonArrayFrom(
		eb.selectFrom('kino_seasons').selectAll().whereRef('kino_seasons.id', '=', 'kino_tv.id').orderBy('kino_seasons.season_number')
	)
		.$castTo<kt.Season[]>()
		.as('seasons');
}

/** Likewise for the episodes of a season */
function withEpisodes(eb: ExpressionBuilder<Schema, 'kino_seasons'>): AliasedRawBuilder<kt.Episode[], 'episodes'> {
	return jsonArrayFrom(
		eb
			.selectFrom('kino_episodes')
			.selectAll()
			.whereRef('kino_episodes.id', '=', 'kino_seasons.id')
			.whereRef('kino_episodes.season_number', '=', 'kino_seasons.season_number')
			.orderBy('kino_episodes.episode_number')
	)
		.$castTo<kt.Episode[]>()
		.as('episodes');
}

export async function getTv(id: number): Promise<kt.Tv> {
	const result = await database.selectFrom('kino_tv').where('id', '=', id).selectAll().select(withSeasons).executeTakeFirst();

	// Search caches shows without their seasons, so a row on its own is not enough to skip TMDB
	if (result?.seasons.length) return result;

	const tv = await tmdb().tvShows.details(id).then(kt.Tv.parse);

	await database
		.insertInto('kino_tv')
		.values(omit(tv, 'seasons'))
		.onConflict(b => b.doNothing())
		.execute();

	for (const season of tv.seasons || []) {
		season.id = id;

		await database
			.insertInto('kino_seasons')
			.values(omit(season, 'episodes'))
			.onConflict(b => b.doNothing())
			.execute();
	}

	return tv;
}

export async function getSeason(id: number, season_number: number): Promise<kt.Season> {
	const result = await database
		.selectFrom('kino_seasons')
		.where(eb => eb.and({ id, season_number }))
		.selectAll()
		.select(withEpisodes)
		.executeTakeFirst();

	/**
	 * `getTv` inserts season rows without any episodes, so the row alone is not enough either.
	 * A season that genuinely has no episodes (e.g. one that has not aired) will re-check TMDB each time.
	 */
	if (result?.episodes.length) return result;

	const season = await tmdb().tvSeasons.details({ tvShowID: id, seasonNumber: season_number }).then(kt.Season.parse);
	season.id = id;

	for (const episode of season.episodes || []) {
		episode.id = id;

		await database
			.insertInto('kino_episodes')
			.values(episode)
			.onConflict(b => b.doNothing())
			.execute();
	}

	await database
		.insertInto('kino_seasons')
		.values(omit(season, 'episodes'))
		.onConflict(b => b.doNothing())
		.execute();

	return season;
}

export async function getEpisode(id: number, season_number: number, episode_number: number): Promise<kt.Episode> {
	const result = await database
		.selectFrom('kino_episodes')
		.where(eb => eb.and({ id, season_number, episode_number }))
		.selectAll()
		.executeTakeFirst();
	if (result) return result;

	const episode = await tmdb()
		.tvEpisode.details({ tvShowID: id, seasonNumber: season_number, episodeNumber: episode_number })
		.then(kt.Episode.parse);
	episode.id = id;

	await database
		.insertInto('kino_episodes')
		.values(episode)
		.onConflict(b => b.doNothing())
		.execute();

	return episode;
}
