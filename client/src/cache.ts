export interface CacheOptions {
	/** Maximum number of items the cache can hold */
	itemLimit: number;
}

interface Cache<K = any, T = any> extends CacheOptions {
	items: Map<K, T>;
}

const _caches: Record<string, Cache> = Object.create(null);

const defaultCacheOptions = {
	itemLimit: 10_000,
};

/**
 * Create a cache manually. Only useful when you want to specify different options.
 */
export function createCache(cacheName: string, options: Partial<CacheOptions> = {}): void {
	if (_caches[cacheName]) throw new Error('Multiple caches with the same name are not allowed');
	_caches[cacheName] = {
		items: new Map(),
		...defaultCacheOptions,
		...options,
	};
}

/**
 * Use a cache for some arbitrary operation.
 * This is primarily intended for de-duplicating API requests
 * @param cacheName The name of the cache to use, e.g. `'users'`
 * @param key The key for the item in the cache. This can be anything used for the key of a `Map`
 * @param miss The function to run on a cache miss
 * @remarks
 * Note that a cache will automatically be created if it doesn't already exist
 */
export function useCache<Key, Result>(cacheName: string, key: Key, miss: () => Result): Result {
	const cache: Cache<Key, Result> = (_caches[cacheName] ||= { items: new Map(), ...defaultCacheOptions });
	const cached = cache.items.get(key);
	if (cached) return cached;
	const result = miss();
	cache.items.set(key, result);
	return result;
}
