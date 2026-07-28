import { fetchAPI, origin, prefix } from '@axium/client/requests';
import { uploadChunked, type ProgressHandler } from '@axium/client/uploads';
import type * as kt from 'kinotool';
import { prettifyError } from 'zod';
import {
	KinoUpload,
	type ImageSize,
	type ImageType,
	type KinoEpisode,
	type KinoMovie,
	type KinoSearchResults,
	type KinoSeason,
} from '../common.js';

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

export function movieDataURL(id: number): string {
	return raw('movies/' + id).href;
}

export function episodeDataURL(id: number, season: number, episode: number): string {
	return raw(`tv/${id}/${season}/${episode}`).href;
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
