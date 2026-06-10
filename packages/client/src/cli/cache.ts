import { App, Session, SyncState, User } from '@axium/core';
import * as io from 'ioium/node';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path/posix';
import * as z from 'zod';
import type Cache from '../cache.js';
import { CacheData } from '../cache.js';
import { fetchAPI } from '../requests.js';
import { apiUserCache, getCurrentSession } from '../user.js';

export const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'axium');
mkdirSync(dir, { recursive: true });

const create = Symbol('Handle::new');

export class Handle<S extends z.ZodObject> {
	private _data?: z.infer<S>;

	public readonly path: string;

	public get schema(): S {
		return this.init.schema;
	}

	private constructor(private init: Init<S>) {
		this.path = resolve(dir, init.path);
	}

	public load() {
		if (!existsSync(this.path)) {
			io.debug('Ignoring missing cache file:', this.path);
			return;
		}

		try {
			this._data = io.readJSON(this.path, this.schema);
		} catch (e: any) {
			io.warn(`Failed to load cache from '${this.path}':\n${e}`);
			return;
		}

		this.init.onLoad?.(this._data);
	}

	public save() {
		if (!this._data) throw new ReferenceError('Cache data is not loaded');
		try {
			io.writeJSON(this.path, this._data);
		} catch (e) {
			io.error(e);
		}
	}

	public async update() {
		this._data = await this.init.update(this._data);
		this.init.onLoad?.(this._data);
		this.save();
	}

	async isValid() {
		if (!this._data) return false;
		return this.init.isValid(this._data, statSync(this.path).mtimeMs);
	}

	public get data(): z.infer<S> {
		return this._data!;
	}

	static [create]<S extends z.ZodObject>(init: Init<S>) {
		return new Handle<S>(init);
	}
}

const handles: Handle<any>[] = [];

export interface Init<S extends z.ZodObject> {
	path: string;
	schema: S;
	update(existing?: z.infer<S>): z.infer<S> | Promise<z.infer<S>>;
	isValid(data: z.infer<S>, lastUpdatedTs: number): boolean | Promise<boolean>;
	onLoad?(data: z.infer<S>): unknown;
}

export function useAt<S extends z.ZodObject>(init: Init<S>): Handle<S> {
	const handle = Handle[create](init);
	mkdirSync(dirname(handle.path), { recursive: true });
	handles.push(handle);
	return handle;
}

const _dayMs = 24 * 3600_000;

export const meta = useAt({
	path: 'meta.json',
	schema: z.looseObject({
		fetched: z.int(),
		session: Session.extend({ user: User }),
		apps: App.array(),
	}),
	async update() {
		const [session, apps] = await io.track('Fetching metadata', Promise.all([getCurrentSession(), fetchAPI('GET', 'apps')]));
		return { fetched: Date.now(), session, apps };
	},
	isValid: meta => meta.fetched + _dayMs > Date.now(),
});

export const sync = useAt({
	path: 'sync.json',
	schema: SyncState,
	async update(sync) {
		if (!sync) return await fetchAPI('GET', 'sync/init');

		const diff = await fetchAPI('GET', 'sync', { since: sync.index });

		const deleted = new Set(diff.deleted);

		const objects = sync.objects.filter(o => !deleted.has(o.id));

		const existing = Object.fromEntries(objects.map(o => [o.id, o]));

		for (const obj of diff.created) objects.push(obj);

		for (const updated of diff.updated) {
			const base = existing[updated.id];

			if (!base) throw new ReferenceError("Can not update object because it isn't cached");

			if (base.$type !== updated.$type)
				throw new ReferenceError(`Type mismatch whilst updating cache object: currently ${base.$type}, incoming ${updated.$type}`);

			Object.assign(base, updated);
		}

		return { objects, index: diff.index };
	},
	async isValid({ index }) {
		const md = await fetchAPI('GET', 'sync/metadata');
		return md.index >= index;
	},
});

const persistedAPICaches: { path: string; cache: Cache<any, any> }[] = [];

function persistAPI(cache: Cache<any, any>, path: string) {
	path = resolve(dir, path);
	let data: Record<string, any> | undefined;
	try {
		data = io.readJSON(path, CacheData);
	} catch {
		// missing
	}

	cache.persist(data => io.writeJSON(path, data), data);
	persistedAPICaches.push({ path, cache });
}

export function load() {
	for (const handle of handles) handle.load();
	persistAPI(apiUserCache, 'users.json');
}

export async function update(force: boolean = false) {
	for (const handle of handles) {
		if (force || !(await handle.isValid())) await handle.update();
	}
}

export function clear() {
	for (const handle of handles) unlinkSync(handle.path);

	for (const { path } of persistedAPICaches) unlinkSync(path);
}

export interface CacheInfo {
	path: string;
	size?: bigint;
	exists: boolean;
}

export interface CacheInfoLocal extends CacheInfo {
	valid: boolean;
	fromAPI?: false;
}

export interface CacheInfoAPI extends CacheInfo {
	entries: number;
	fromAPI: true;
}

export async function* info(): AsyncGenerator<CacheInfoLocal | CacheInfoAPI> {
	for (const handle of handles) {
		const { path } = handle;
		const exists = existsSync(path);
		const { size } = exists ? statSync(path, { bigint: true }) : {};
		yield { path, exists, size, valid: await handle.isValid() };
	}

	for (const { path, cache } of persistedAPICaches) {
		const exists = existsSync(path);
		const { size } = exists ? statSync(path, { bigint: true }) : {};
		yield { path, exists, size, entries: cache.size, fromAPI: true };
	}
}
