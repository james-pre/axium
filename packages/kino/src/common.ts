import { serverConfigs } from '@axium/core';
import { $API } from '@axium/core/api';
import type {} from '@axium/core/plugins';
import { zKeys } from '@axium/core/locales';
import { UploadConfig, UploadInit, UploadName, UploadSize } from '@axium/core/uploads';
import * as z from 'zod';
import * as kt from 'kinotool/tmdb';

const base62 = /^[0-9A-Za-z]+$/;

export const ImageExt = z.literal(['jpg', 'png']);
export const ImageID = z.string().length(27).regex(base62);
export const ImageFile = z.templateLiteral([ImageID, '.', ImageExt]);

export const imagesSizes = {
	backdrop: ['w300', 'w780', 'w1280', 'original'],
	logo: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
	poster: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
	profile: ['w45', 'w185', 'h632', 'original'],
	still: ['w92', 'w185', 'w300', 'original'],
	all: ['w45', 'w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'w1280', 'h632', 'original'],
} as const;

export const ImageType = z.literal(Object.keys(imagesSizes) as Exclude<keyof typeof imagesSizes, 'all'>[]);
export type ImageType = z.infer<typeof ImageType>;

export const ImageSize = z.literal(imagesSizes.all).register(zKeys, { key: 'kino.config.image_size', prefix: 'kino.image_size' });
export type ImageSize = z.infer<typeof ImageSize>;

export function imageWidth(size: ImageSize): number {
	if (size[0] === 'w') return parseInt(size.slice(1));
	return size == 'original' ? 1e10 : 421;
}

/** All the image sizes share one set of translations, since they are the same vocabulary of TMDB buckets */
const sizeLocale = { prefix: 'kino.image_size' };

export const PosterImageSize = z.literal(imagesSizes.poster).register(zKeys, { key: 'kino.config.poster_size', ...sizeLocale }),
	BackdropImageSize = z.literal(imagesSizes.backdrop).register(zKeys, { key: 'kino.config.backdrop_size', ...sizeLocale }),
	LogoImageSize = z.literal(imagesSizes.logo).register(zKeys, { key: 'kino.config.logo_size', ...sizeLocale }),
	ProfileImageSize = z.literal(imagesSizes.profile).register(zKeys, { key: 'kino.config.profile_size', ...sizeLocale }),
	StillImageSize = z.literal(imagesSizes.still).register(zKeys, { key: 'kino.config.still_size', ...sizeLocale });

export const ImageSelection = z.discriminatedUnion('type', [
	z.object({ type: z.literal('poster'), size: PosterImageSize.optional() }),
	z.object({ type: z.literal('backdrop'), size: BackdropImageSize.optional() }),
	z.object({ type: z.literal('logo'), size: LogoImageSize.optional() }),
	z.object({ type: z.literal('profile'), size: ProfileImageSize.optional() }),
	z.object({ type: z.literal('still'), size: StillImageSize.optional() }),
	z.object({ type: z.union([z.undefined(), z.null()]), size: ImageSize.optional() }),
]);

/**
 * How uploads are prepared for playback:
 * original: serve the uploaded file as-is
 * both: keep the original for download and serve a remuxed copy to browsers
 * replace: remux on upload and discard the original
 */
export const RemuxMode = z.literal(['original', 'both', 'replace']).register(zKeys, { key: 'kino.config.remux', prefix: 'kino.remux' });
export type RemuxMode = z.infer<typeof RemuxMode>;

export const ImageCacheMode = z
	.literal(['disabled', 'fallback', 'exact-size', 'quality', 'prefer'])
	.register(zKeys, { key: 'kino.config.cache_mode', prefix: 'kino.cache_mode' });
export type ImageCacheMode = z.infer<typeof ImageCacheMode>;

export const KinoConfig = z.object({
	allow_user_uploads: z.boolean(),
	data_dir: z.string().nonempty(),
	tmdb_api_key: z.string(),
	remux: RemuxMode,
	images: z.object({
		cache: z.object({
			/**
			 * disabled: images will not be cached
			 * fallback: only use cached images if TMDB is unavailable. `largest_only` should be used with this option.
			 * exact-size: use cached images when their size is the same as the requested sized
			 * quality: use cached images when their size is at least the requested sized
			 * prefer: always used cached images
			 */
			mode: ImageCacheMode,
			/** Max cache size in MiB, 0=unlimited */
			max_size: z.number().nonnegative(),
			/** The directory to store cached images */
			directory: z.string().nonempty(),
			/**
			 * If set, only the largest size of an image will be cached.
			 * This will decrease cache size but increase network bandwidth
			 */
			largest_only: z.boolean(),
			max_image_sizes: z.object({
				poster: PosterImageSize,
				backdrop: BackdropImageSize,
				logo: LogoImageSize,
				profile: ProfileImageSize,
				still: StillImageSize,
			}),
		}),
		base_url: z.url(),
	}),
	upload: UploadConfig,
});
export interface KinoConfig extends z.infer<typeof KinoConfig> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/kino': KinoConfig;
	}
}

serverConfigs.set('@axium/kino', KinoConfig);

export const KinoMovieUploadInit = z.object({
	...UploadInit.shape,
	id: z.int().positive().nullish(),
});
export interface KinoMovieUploadInit extends z.infer<typeof KinoMovieUploadInit> {}

export const KinoMovieUploadResult = z.object({
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: z.int().positive(),
	movie: kt.Movie,
	token: z.base64url(),
});
export type KinoMovieUploadResult = z.infer<typeof KinoMovieUploadResult>;

export const KinoTvUploadInit = z.object({
	...UploadInit.shape,
	season: z.int().nonnegative(),
	episode: z.int().positive(),
});
export interface KinoTvUploadInit extends z.infer<typeof KinoTvUploadInit> {}

export const KinoTvUploadResult = z.object({
	/** Maximum size in MiB per transfer/request */
	max_transfer_size: z.int().positive(),
	episode: kt.Episode,
	token: z.base64url(),
});
export interface KinoTvUploadResult extends z.infer<typeof KinoTvUploadResult> {}

export const KinoSearchQuery = z.object({
	query: z.string().min(1),
	type: z.literal(['movie', 'tv']).optional(),
});
export interface KinoSearchQuery extends z.infer<typeof KinoSearchQuery> {}

export const KinoSearchResults = z.union([kt.Movie.extend({ type: z.literal('movie') }), kt.Tv.extend({ type: z.literal('tv') })]).array();
export type KinoSearchResults = z.infer<typeof KinoSearchResults>;

/** Information about the file backing a movie or episode. `null` when nothing has been uploaded yet. */
export const KinoUpload = z.object({
	uploadedAt: z.coerce.date(),
	name: UploadName.nullish(),
	size: UploadSize,
	type: z.string(),
});
export interface KinoUpload extends z.infer<typeof KinoUpload> {}

export const KinoMovie = kt.Movie.extend({ upload: KinoUpload.nullish() });
export interface KinoMovie extends z.infer<typeof KinoMovie> {}

export const KinoEpisode = kt.Episode.extend({ upload: KinoUpload.nullish() });
export interface KinoEpisode extends z.infer<typeof KinoEpisode> {}

export const KinoSeason = kt.Season.extend({ episodes: KinoEpisode.array().optional() });
export interface KinoSeason extends z.infer<typeof KinoSeason> {}

const KinoAPI = {
	'kino/movies': {
		GET: KinoMovie.array(),
	},
	'kino/movies/upload': {
		PUT: [KinoMovieUploadInit, KinoMovieUploadResult],
	},
	'kino/movies/:id': {
		GET: KinoMovie,
	},
	'kino/tv': {
		GET: kt.Tv.array(),
	},
	'kino/tv/:id': {
		GET: kt.Tv,
	},
	'kino/tv/:id/season/:season': {
		GET: KinoSeason,
	},
	'kino/tv/:id/season/:season/episode/:episode': {
		GET: KinoEpisode,
	},
	'kino/tv/:id/upload': {
		PUT: [KinoTvUploadInit, KinoTvUploadResult],
	},
	'kino/search': {
		POST: [KinoSearchQuery, KinoSearchResults],
	},
} as const;

type KinoAPI = typeof KinoAPI;

declare module '@axium/core/api' {
	export interface $API extends KinoAPI {}
}

Object.assign($API, KinoAPI);
