import * as z from 'zod';

export interface CacheOptions {
	/** Maximum number of items the cache can hold */
	itemLimit: number;

	/** @todo replace with `Temporal.DurationLike` */
	ttl: number;
}

const defaultCacheOptions = {
	itemLimit: 10_000,
	ttl: 3600_000,
};

export const CacheData = z.record(
	z.string(),
	z.looseObject({
		/** @todo replace with temporal instant */
		$timestamp: z.coerce.date(),
	})
);

/** @todo replace `$timestamp` with `Temporal.InstantLike` */
export interface CacheData<V> extends Record<string, V & { $timestamp: number }> {}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return !!(value && typeof value == 'object' && 'then' in value && typeof value.then == 'function');
}

const kTimestamp = Symbol('kTimestamp');

/**
 * Cache some arbitrary operation.
 * This is primarily intended for de-duplicating API requests
 */
export class Cache<Keys extends string[], V extends object> {
	protected items = new Map<string, V & { [kTimestamp]: number }>();
	protected pending = new Map<string, Promise<V>>();
	public readonly options: CacheOptions;

	private onWrite?: (data: CacheData<V>) => void;

	constructor(
		/**
		 * Function to run when there is a cache miss
		 * @
		 */
		protected readonly miss: (...keys: Keys) => V | Promise<V>,
		options: Partial<CacheOptions> = {}
	) {
		this.options = { ...defaultCacheOptions, ...options };
	}

	protected key(keys: Keys): string {
		return keys.join(':');
	}

	public get size(): number {
		return this.items.size;
	}

	protected valid(timestamp?: number) {
		return !this.options.ttl || !timestamp || timestamp.valueOf() + this.options.ttl < Date.now();
	}

	protected write(key: string, value: V | Promise<V>) {
		if (isThenable(value)) {
			this.pending.set(key, value);
			void value.then(resolved => {
				this.write(key, resolved);
				this.pending.delete(key);
			});
			return;
		}

		if (this.items.size >= this.options.itemLimit) {
			const [key] = this.items.entries().next().value!;
			this.items.delete(key);
		}

		this.items.set(key, Object.assign(value, { [kTimestamp]: Date.now() }));
		this.onWrite?.(this.toJSON());
	}

	public get(...keys: Keys): V | Promise<V> {
		const key = this.key(keys);
		const pending = this.pending.get(key);
		if (pending) return pending;
		const cached = this.items.get(key);
		if (cached) {
			if (this.valid(cached[kTimestamp])) return cached;
			this.items.delete(key);
		}
		const result = this.miss(...keys);
		this.write(key, result);
		return result;
	}

	public set(...args: [...keys: Keys, value: V | Promise<V>]) {
		const value = args.pop() as V | Promise<V>;
		const key = this.key(args as any);
		this.write(key, value);
	}

	public invalidate(...keys: Keys): void {
		this.items.delete(this.key(keys));
	}

	public persist(
		onWrite: (data: CacheData<V>) => void,
		/** @todo replace `$timestamp` with `Temporal.InstantLike` */
		existingContent?: Record<string, V & { $timestamp?: number }>
	): void {
		this.onWrite = onWrite;

		if (!existingContent) return;

		for (const [key, value] of Object.entries(existingContent)) {
			const { $timestamp = Date.now() } = value;

			if (!this.valid($timestamp)) continue;

			delete value.$timestamp;

			this.items.set(key, Object.assign(value, { [kTimestamp]: $timestamp }));
		}
	}

	public toJSON(): CacheData<V> {
		return Object.fromEntries(this.items.entries().map(([k, v]) => [k, { ...v, $timestamp: v[kTimestamp] }]));
	}
}

export default Cache;
