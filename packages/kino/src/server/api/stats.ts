import { getConfig, type AsyncResult } from '@axium/core';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { addRoute } from '@axium/server/routes';
import { readdir, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { KinoStatsItem } from '../../common.js';
import * as downloads from '../downloads.js';
import { getCacheSize, maxCacheBytes } from '../images.js';

/** How many of the largest titles are listed */
const largestLimit = 10;

/**
 * The size of every file under `directory` in bytes, totalled by the ID that starts its path.
 * Movie files are named by ID, and episodes are stored under a directory named by the show's ID.
 */
async function sizesById(directory: string): Promise<Map<number, number>> {
	const sizes = new Map<number, number>();

	// Nothing has been uploaded yet
	const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(() => []);

	await Promise.all(
		entries
			.filter(entry => entry.isFile())
			.map(async entry => {
				const path = join(entry.parentPath, entry.name);
				const id = parseInt(path.slice(directory.length + 1).split(sep)[0]);
				if (Number.isNaN(id)) return;

				const { size } = await stat(path).catch(() => ({ size: 0 }));
				sizes.set(id, (sizes.get(id) ?? 0) + size);
			})
	);

	return sizes;
}

function sum(sizes: Map<number, number>): number {
	return sizes.values().reduce((total, size) => total + size, 0);
}

async function getLargest(movieSizes: Map<number, number>, tvSizes: Map<number, number>): Promise<KinoStatsItem[]> {
	const largest = [
		...movieSizes.entries().map(([id, size]) => ({ type: 'movie' as const, id, size })),
		...tvSizes.entries().map(([id, size]) => ({ type: 'tv' as const, id, size })),
	]
		.sort((a, b) => b.size - a.size)
		.slice(0, largestLimit);

	const movieIds = largest.filter(item => item.type == 'movie').map(item => item.id),
		showIds = largest.filter(item => item.type == 'tv').map(item => item.id);

	const [movies, shows] = await Promise.all([
		movieIds.length
			? database.selectFrom('kino_movies').select(['id', 'title as name', 'poster_path']).where('id', 'in', movieIds).execute()
			: [],
		showIds.length ? database.selectFrom('kino_tv').select(['id', 'name', 'poster_path']).where('id', 'in', showIds).execute() : [],
	]);

	const metadata = new Map([
		...movies.map(movie => ['movie:' + movie.id, movie] as const),
		...shows.map(show => ['tv:' + show.id, show] as const),
	]);

	// Files without metadata still count towards the totals, but there is nothing to show for them here
	return largest.flatMap(item => {
		const media = metadata.get(`${item.type}:${item.id}`);
		return media ? [{ ...item, name: media.name, poster_path: media.poster_path }] : [];
	});
}

addRoute({
	path: '/api/kino/stats',
	async GET(req): AsyncResult<'GET', 'kino/stats'> {
		const { userId } = await requireSession(req);

		const { data_dir } = getConfig('@axium/kino');

		const [movieSizes, tvSizes, uploads, watched] = await Promise.all([
			sizesById(join(data_dir, 'movie')),
			sizesById(join(data_dir, 'tv')),
			database
				.selectNoFrom(eb => [
					eb.selectFrom('kino_movie_uploads').select(eb.fn.countAll().as('count')).as('movies'),
					eb
						.selectFrom('kino_tv_uploads')
						.select(uploads => uploads.fn.count('id').distinct().as('count'))
						.as('shows'),
					eb.selectFrom('kino_tv_uploads').select(eb.fn.countAll().as('count')).as('episodes'),
				])
				.executeTakeFirstOrThrow(),
			database
				.selectNoFrom(eb => [
					eb.selectFrom('kino_movie_views').select(eb.fn.countAll().as('count')).where('userId', '=', userId).as('movies'),
					eb.selectFrom('kino_tv_views').select(eb.fn.countAll().as('count')).where('userId', '=', userId).as('episodes'),
				])
				.executeTakeFirstOrThrow(),
		]);

		const limit = maxCacheBytes();

		const active = downloads.enabled() ? downloads.list() : null;

		return {
			counts: { movies: Number(uploads.movies), shows: Number(uploads.shows), episodes: Number(uploads.episodes) },
			size: { movies: sum(movieSizes), tv: sum(tvSizes) },
			images: { size: Number(getCacheSize()), limit: limit === false ? null : Number(limit) },
			downloads: active && {
				active: active.filter(download => download.state != 'seeding' && download.state != 'failed').length,
				seeding: active.filter(download => download.state == 'seeding').length,
			},
			watched: { movies: Number(watched.movies), episodes: Number(watched.episodes) },
			largest: await getLargest(movieSizes, tvSizes),
		};
	},
});
