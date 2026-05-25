import { App, Session, SyncState, User, type SyncDiffObject } from '@axium/core';
import * as io from 'ioium/node';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path/posix';
import * as z from 'zod';
import { fetchAPI } from '../requests.js';
import { getCurrentSession } from '../user.js';

export const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'axium');
mkdirSync(dir, { recursive: true });

export const Metadata = z.looseObject({
	fetched: z.int(),
	session: Session.extend({ user: User }),
	apps: App.array(),
});
export interface Metadata extends z.infer<typeof Metadata> {}

interface FileHandle<S extends z.ZodObject> {
	load(): void;
	save(): void;
	update(): Promise<void>;
	path: string;
	schema: S;
	get data(): z.infer<S>;
}

const handles: FileHandle<any>[] = [];

function useAt<S extends z.ZodObject>(
	path: string,
	schema: S,
	update: (existing?: z.infer<S>) => z.infer<S> | Promise<z.infer<S>>,
	onLoad?: (data: z.infer<S>) => unknown
): FileHandle<S> {
	path = resolve(dir, path);

	mkdirSync(dirname(path), { recursive: true });
	if (!existsSync(path)) io.writeJSON(path, {});

	let data: z.infer<S>;

	const handle = {
		load() {
			try {
				data = io.readJSON(path, schema);
				onLoad?.(data);
			} catch (e) {
				io.error(e);
			}
		},
		save() {
			if (!data) throw new ReferenceError('Cache data is not loaded');
			try {
				io.writeJSON(path, data);
			} catch (e) {
				io.error(e);
			}
		},
		async update() {
			data = await update(data);
			onLoad?.(data);
		},
		path,
		schema,
		get data() {
			return data;
		},
	} satisfies FileHandle<S>;

	handles.push(handle);

	return handle;
}

export const meta = useAt('meta.json', Metadata, async () => {
	const [session, apps] = await io.track('Fetching metadata', Promise.all([getCurrentSession(), fetchAPI('GET', 'apps')]));
	return { fetched: Date.now(), session, apps };
});

export const sync = useAt('sync.json', SyncState, async sync => {
	using _ = io.start('Syncing');

	if (!sync) {
		const init = await fetchAPI('GET', 'sync/init');
		io.done();
		return init;
	}

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

	io.done();

	return { objects, index: diff.index };
});

export function load() {
	for (const handle of handles) handle.load();
}

export const _dayMs = 24 * 3600_000;

export async function update(force: boolean) {
	if (!force && meta.data?.fetched + _dayMs > Date.now()) return;

	for (const handle of handles) {
		await handle.update();
		handle.save();
	}
}
