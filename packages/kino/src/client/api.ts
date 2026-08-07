import { fetchAPI, origin, prefix, token } from '@axium/client/requests';
import { uploadChunked, type ProgressHandler } from '@axium/client/uploads';
import type * as kt from 'kinotool';
import { prettifyError } from 'zod';
import type {
	ImageSize,
	ImageType,
	KinoEpisode,
	KinoMovie,
	KinoSearchResults,
	KinoSeason,
	KinoView,
	KinoViewFilter,
	KinoViewInit,
} from '../common.js';
import { KinoUpload } from '../common.js';

/** Build an absolute URL for one of kino's `/raw` endpoints */
function raw(suffix: string): URL {
	if (prefix[0] == '/') return new URL('/raw/kino/' + suffix, origin);
	const url = new URL(prefix);
	url.pathname = '/raw/kino/' + suffix;
	return url;
}

/**
 * The URL for a TMDB image path, e.g. `poster_path`.
 * Query values are JSON-encoded since the server parses search parameters as JSON.
 */
export function imageURL(path: string | null | undefined, type: ImageType, size?: ImageSize): string | undefined {
	if (!path) return undefined;

	// TMDB paths already start with a slash
	const url = new URL('/raw/image' + path, origin);
	url.searchParams.set('type', JSON.stringify(type));
	if (size) url.searchParams.set('size', JSON.stringify(size));
	return url.href;
}

/**
 * The URL a movie's file is served from.
 * `download` asks for the original upload as an attachment rather than the playback copy.
 */
export function movieDataURL(id: number, download: boolean = false): string {
	const url = raw('movies/' + id);
	if (download) url.searchParams.set('download', '');
	return url.href;
}

export function episodeDataURL(id: number, season: number, episode: number, download: boolean = false): string {
	const url = raw(`tv/${id}/${season}/${episode}`);
	if (download) url.searchParams.set('download', '');
	return url.href;
}

export async function searchMedia(query: string, type?: 'movie' | 'tv'): Promise<KinoSearchResults> {
	return await fetchAPI('POST', 'kino/search', { query, type });
}

/** All movies that have been uploaded */
export async function getUploadedMovies(): Promise<KinoMovie[]> {
	return await fetchAPI('GET', 'kino/movies');
}

export async function getMovie(id: number): Promise<KinoMovie> {
	return await fetchAPI('GET', 'kino/movies/:id', undefined, String(id));
}

/** All TV shows with at least one uploaded episode */
export async function getUploadedShows(): Promise<kt.Tv[]> {
	return await fetchAPI('GET', 'kino/tv');
}

export async function getTv(id: number): Promise<kt.Tv> {
	return await fetchAPI('GET', 'kino/tv/:id', undefined, String(id));
}

export async function getSeason(id: number, season: number): Promise<KinoSeason> {
	return await fetchAPI('GET', 'kino/tv/:id/season/:season', undefined, String(id), String(season));
}

export async function getEpisode(id: number, season: number, episode: number): Promise<KinoEpisode> {
	return await fetchAPI('GET', 'kino/tv/:id/season/:season/episode/:episode', undefined, String(id), String(season), String(episode));
}

/** The episodes either side of the one being watched, so viewers can move through a show without going back to the season page. */
export async function getAdjacentEpisodes(
	show: kt.Tv,
	season: number,
	episode: number
): Promise<{ previous?: KinoEpisode; next?: KinoEpisode }> {
	const numbers = [...new Set([...(show.seasons ?? []).map(s => s.season_number), season])].sort((a, b) => a - b);

	const loaded = new Map<number, Promise<KinoEpisode[]>>();

	const _seasons = (number: number): Promise<KinoEpisode[]> =>
		getSeason(show.id, number)
			.then(s => s.episodes ?? [])
			.catch(() => []);

	async function find(step: -1 | 1): Promise<KinoEpisode | undefined> {
		const current = await loaded.getOrInsertComputed(season, _seasons);
		const at = current.findIndex(e => e.episode_number == episode);

		if (at >= 0 && current[at + step]) return current[at + step];

		for (let i = numbers.indexOf(season) + step; i >= 0 && i < numbers.length; i += step) {
			const episodes = await loaded.getOrInsertComputed(numbers[i], _seasons);
			const neighbor = step < 0 ? episodes.at(-1) : episodes[0];
			if (neighbor) return neighbor;
		}
	}

	const [previous, next] = await Promise.all([find(-1), find(1)]);
	return { previous, next };
}

/** Recently watched items, most recent first */
export async function getViews(filter: KinoViewFilter & { type: 'movie' }): Promise<(KinoView & { type: 'movie' })[]>;
export async function getViews(filter: KinoViewFilter & { type: 'tv' }): Promise<(KinoView & { type: 'tv' })[]>;
export async function getViews(filter?: KinoViewFilter): Promise<KinoView[]>;
export async function getViews(filter: KinoViewFilter = {}): Promise<KinoView[]> {
	return await fetchAPI('GET', 'kino/views', filter);
}

/** Record that something was watched, and how far through it the viewer is */
export async function recordView(init: KinoViewInit): Promise<KinoView> {
	return await fetchAPI('PUT', 'kino/views', init);
}

/**
 * Record a view while the page is going away.
 *
 * `keepalive` lets the request outlive the document; a normal fetch is cancelled on unload.
 * `navigator.sendBeacon` can't be used here — it is POST-only and can't set the Authorization header.
 */
export function recordViewClosing(init: KinoViewInit): void {
	const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
	if (token) headers.Authorization = 'Bearer ' + token;

	// Nothing can act on a failure at this point, so errors are dropped
	void fetch(prefix + 'kino/views', {
		method: 'PUT',
		headers,
		body: JSON.stringify(init),
		keepalive: true,
	}).catch(() => {});
}

/** Delete a movie's upload and its files. Administrators only. */
export async function deleteMovieUpload(id: number): Promise<KinoUpload> {
	return await fetchAPI('DELETE', 'kino/movies/:id', undefined, String(id));
}

/** Delete an episode's upload and its files. Administrators only. */
export async function deleteEpisodeUpload(id: number, season: number, episode: number): Promise<KinoUpload> {
	return await fetchAPI('DELETE', 'kino/tv/:id/season/:season/episode/:episode', undefined, String(id), String(season), String(episode));
}

export interface UploadOptions {
	onProgress?: ProgressHandler;
	signal?: AbortSignal;
}

async function _upload(endpoint: URL, token: string, maxTransferSize: number, file: File, options: UploadOptions): Promise<KinoUpload> {
	const result = await uploadChunked({
		endpoint,
		token,
		stream: file.stream(),
		itemSize: file.size,
		maxTransferSize,
		onProgress: options.onProgress,
		signal: options.signal,
	});

	try {
		return KinoUpload.parse(result);
	} catch (e: any) {
		throw prettifyError(e);
	}
}

/**
 * Upload a movie file.
 * When `id` is omitted the server resolves the movie from the file name.
 */
export async function uploadMovie(file: File, id?: number, options: UploadOptions = {}): Promise<KinoUpload> {
	options.onProgress?.(0, file.size);

	const { max_transfer_size, token } = await fetchAPI('PUT', 'kino/movies/upload', {
		id,
		name: file.name,
		size: file.size,
		type: file.type,
		hash: null,
	});

	return await _upload(raw('movies/upload'), token, max_transfer_size, file, options);
}

export async function uploadEpisode(
	file: File,
	id: number,
	season: number,
	episode: number,
	options: UploadOptions = {}
): Promise<KinoUpload> {
	options.onProgress?.(0, file.size);

	const { max_transfer_size, token } = await fetchAPI(
		'PUT',
		'kino/tv/:id/upload',
		{ season, episode, name: file.name, size: file.size, type: file.type, hash: null },
		String(id)
	);

	return await _upload(raw(`tv/${id}/upload`), token, max_transfer_size, file, options);
}
