import { getConfig } from '@axium/core';
import { parseSearch } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as io from 'ioium/node';
import mime from 'mime';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { ImageFile, ImageSelection, type ImageSize, imagesSizes, type ImageType, imageWidth } from '../common.js';

export function getCachePath(file: string, size: ImageSize): string {
	const path = join(getConfig('@axium/kino').images.cache.directory, size, file);
	fs.mkdirSync(dirname(path), { recursive: true });
	return path;
}

export function getCachedSizes(file: string, type?: ImageType | null): ImageSize[] {
	const dir = getConfig('@axium/kino').images.cache.directory;
	return imagesSizes[type || 'all'].filter(size => fs.existsSync(join(dir, size, file)));
}

let cacheSize: bigint;

export function removeFromCache(file: string, size: ImageSize) {
	cacheSize ??= computeCacheSize();
	const path = getCachePath(file, size);

	try {
		const { size } = fs.statSync(path, { bigint: true });
		fs.unlinkSync(path);
		cacheSize -= size;
	} catch {
		// ignore
	}
}

export type CacheEntry = [name: string, size: bigint, atime: bigint];

/** Get all the files in the cache */
export function* getCacheFiles(): Generator<CacheEntry> {
	const { cache } = getConfig('@axium/kino').images;

	for (const file of fs.readdirSync(cache.directory, { recursive: true, encoding: 'utf8' })) {
		try {
			const stats = fs.statSync(join(cache.directory, file), { bigint: true });
			if (!stats.isFile()) continue;
			yield [file, stats.size, stats.atimeMs];
		} catch {
			// ignore
		}
	}
}

/** Compute cache size */
export function computeCacheSize(files: Iterable<CacheEntry> = getCacheFiles()): bigint {
	let sum = 0n;
	for (const [, size] of files) sum += size;
	return sum;
}

/** The maximum cache size in bytes, or false when the cache is unlimited */
export function maxCacheBytes(): bigint | false {
	const { max_size } = getConfig('@axium/kino').images.cache;
	return max_size ? BigInt(Math.floor(max_size * 1024 * 1024)) : false;
}

export function pruneCache() {
	const { cache } = getConfig('@axium/kino').images;

	const max = maxCacheBytes();
	if (!max) return;

	const files = Array.from(getCacheFiles());

	cacheSize ??= computeCacheSize(files);

	// Least recently used first, evicting the largest first when access times are equal
	files.sort(([, sizeA, timeA], [, sizeB, timeB]) => Number(timeA - timeB || sizeB - sizeA));

	for (const [file, size] of files) {
		if (cacheSize < max) return;

		try {
			fs.unlinkSync(join(cache.directory, file));
		} catch {
			continue; // already gone; don't credit its size
		}
		cacheSize -= size;
	}
}

addRoute({
	path: '/raw/image/:file',
	params: { file: ImageFile },
	async GET(req, { file }) {
		const selection = parseSearch(req, ImageSelection) || {};
		const { base_url, cache } = getConfig('@axium/kino').images;

		const size = selection.size || (selection.type && cache.max_image_sizes[selection.type]) || 'original',
			{ type } = selection;

		const tmdb = new URL(`${base_url}${size}/${file}`);

		if (cache.mode == 'disabled') return Response.redirect(tmdb);

		const cachedSizes = getCachedSizes(file, type),
			cachedImages: [ImageSize, number][] = cachedSizes.map(size => [size, imageWidth(size)]),
			cachedWidths = cachedImages.map(([, width]) => width);

		const targetWidth = imageWidth(size);
		const [closestCachedSize] = cachedImages.toSorted(([, a], [, b]) => Math.abs(a - targetWidth) - Math.abs(b - targetWidth))[0] || [];

		const cachedImage = (size: ImageSize): Response => {
			const headers: HeadersInit = {
				'x-is-cached': '1',
				'Cache-Control': 'public, max-age=31536000, immutable',
			};

			const type = mime.getType(getCachePath(file, size));
			if (type) headers['Content-Type'] = type;

			return new Response(fs.readFileSync(getCachePath(file, size)), { headers });
		};

		const fetchImage = async () => {
			const res = await fetch(tmdb, {
				signal: AbortSignal.timeout(5000),
			}).catch(() => null);

			if (!res?.ok || !res.body) {
				if (res?.status === 404) return new Response(null, { status: 404 });

				io.warnOnce('Kino: using fallback images because TMDB is unavailable');

				if (!closestCachedSize) return new Response('TMDB is unavailable and no sizes of this image are cached', { status: 503 });

				return cachedImage(closestCachedSize);
			}

			if ((cache.largest_only && cachedWidths.some(w => w >= targetWidth)) || cachedSizes.includes(size)) return res;

			const data = await res.bytes();

			try {
				fs.writeFileSync(getCachePath(file, size), data);
				cacheSize ??= computeCacheSize();
				if (cache.largest_only) for (const cachedSize of cachedSizes) removeFromCache(file, cachedSize);
				cacheSize += BigInt(data.byteLength);
				const max = maxCacheBytes();
				if (max && cacheSize > max) pruneCache();
			} catch (e) {
				io.warn('Kino: failed to cache image: ' + io.errorText(e));
			}

			const headers: HeadersInit = { 'Cache-Control': 'public, max-age=31536000, immutable' };
			const contentType = res.headers.get('Content-Type');
			if (contentType) headers['Content-Type'] = contentType;

			return new Response(data, { headers });
		};

		switch (cache.mode) {
			case 'fallback':
				return fetchImage();
			case 'exact-size':
				return cachedSizes.includes(size) ? cachedImage(size) : await fetchImage();
			case 'quality': {
				const [nearestBigSize] = cachedImages.filter(([, w]) => w >= targetWidth).sort(([, a], [, b]) => a - b)[0] || [];
				if (nearestBigSize) return cachedImage(nearestBigSize);
				return await fetchImage();
			}
			case 'prefer':
				return closestCachedSize ? cachedImage(closestCachedSize) : await fetchImage();
		}
	},
});
