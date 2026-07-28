import { database } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import type schema from '../../db.json';
import * as kt from 'kinotool';
import { tmdb } from './tmdb.js';
import { omit } from 'utilium';

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

export async function getTv(id: number): Promise<kt.Tv> {
	const result = await database.selectFrom('kino_tv').where('id', '=', id).selectAll().executeTakeFirst();
	if (result) return result;
	const tv = await tmdb().tvShows.details(id).then(kt.Tv.parse);
	await database.insertInto('kino_tv').values(omit(tv, 'seasons')).returningAll().executeTakeFirstOrThrow();

	for (const season of tv.seasons || []) {
		await database
			.insertInto('kino_seasons')
			.values(season)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(() => {});
	}

	return tv;
}

export async function getSeason(id: number, season_number: number): Promise<kt.Season> {
	const result = await database
		.selectFrom('kino_seasons')
		.where(eb => eb.and({ id, season_number }))
		.selectAll()
		.executeTakeFirst();
	if (result) return result;

	const season = await tmdb().tvSeasons.details({ tvShowID: id, seasonNumber: season_number }).then(kt.Season.parse);

	for (const episode of season.episodes || []) {
		await database
			.insertInto('kino_episodes')
			.values(episode)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(() => {});
	}

	await database.insertInto('kino_seasons').values(omit(season, 'episodes')).returningAll().executeTakeFirstOrThrow();
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

	await database.insertInto('kino_episodes').values(episode).returningAll().executeTakeFirstOrThrow();
	return episode;
}
