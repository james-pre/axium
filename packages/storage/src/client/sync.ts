import { configDir } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import * as io from 'ioium/node';
import mime from 'mime';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path/posix';
import { styleText } from 'node:util';
import { bytes as formatBytes } from 'utilium/format';
import * as z from 'zod';
import { streamRead, streamWrite } from '../node.js';
import '../polyfills.js';
import { SyncRule, SyncRules } from '../rules.js';
import {
	createDirectory,
	createItem,
	createSync,
	downloadItemStream,
	getItemMetadata,
	getSync,
	updateItem,
	updateItemMetadata,
	updateSyncDevice,
} from './api.js';
import { hasTrash, moveToTrash } from './trash.js';

/** Converts `include_dotfiles` and `exclude` into rules. */
function migrateSync(sync: unknown): unknown {
	if (typeof sync != 'object' || !sync || 'rules' in sync) return sync;
	const { include_dotfiles, exclude = [], ...rest } = sync as { include_dotfiles?: boolean; exclude?: string[] };
	return { ...rest, rules: [...(include_dotfiles ? [] : ['-.*']), ...exclude.map(glob => '-/' + glob)] };
}

/**
 * A Sync is a storage item that has been selected for synchronization by the user.
 * Importantly, it is *only* the "top-level" item.
 * This means if a user selects a directory to sync, only that directory is a Sync.
 */
export const Sync = z.preprocess(
	migrateSync,
	z.looseObject({
		name: z.string(),
		item: z.uuid(),
		local_path: z.string(),
		last_synced: z.coerce.date().nullable(),
		remote_path: z.string(),
		rules: SyncRule.array().default([]),
		/** Whether local deletions go to the trash, defaulting to whether a trash exists */
		trash: z.boolean().optional(),
	})
);

export interface Sync extends z.infer<typeof Sync> {}

/** The state of an item when it was last synced. */
const SyncedItem = z.object({
	id: z.uuid(),
	/** `null` for directories */
	hash: z.hex().nullable(),
	size: z.number(),
	/** Local modification time in milliseconds */
	modifiedAt: z.number(),
	/** Deleted remotely but kept locally because it contains items that are not synced */
	deleted: z.boolean().optional(),
});

interface SyncedItem extends z.infer<typeof SyncedItem> {}

const SyncedState = z.object({ items: z.record(z.string(), SyncedItem) });

function syncedStatePath(sync: Sync): string {
	return join(configDir, 'sync', sync.item + '.json');
}

export function removeSyncedState(sync: Sync): void {
	fs.rmSync(syncedStatePath(sync), { force: true });
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e: any) {
		return e.code == 'EPERM';
	}
}

/** Prevents concurrent syncs of the same folder. */
function lock(sync: Sync): Disposable {
	const path = join(configDir, 'sync', sync.item + '.lock');
	fs.mkdirSync(dirname(path), { recursive: true });

	try {
		fs.writeFileSync(path, process.pid.toString(), { flag: 'wx' });
	} catch (e: any) {
		if (e.code != 'EEXIST') throw e;
		const pid = parseInt(fs.readFileSync(path, 'utf8'));
		if (isRunning(pid)) throw new Error(`${sync.name} is already being synced by process ${pid}`, { cause: e });
		fs.writeFileSync(path, process.pid.toString());
	}

	return { [Symbol.dispose]: () => fs.rmSync(path, { force: true }) };
}

interface LocalItem {
	directory: boolean;
	size: number;
	/** In milliseconds */
	modifiedAt: number;
}

export interface RemoteItem {
	id: string;
	directory: boolean;
	hash: string | null;
	size: number;
	modifiedAt: Date;
	immutable: boolean;
}

const partialSuffix = '.axium-sync-partial';

function scanLocal(sync: Sync, rules: SyncRules): Map<string, LocalItem> {
	const items = new Map<string, LocalItem>();

	function walk(directory: string) {
		for (const entry of fs.readdirSync(join(sync.local_path, directory), { withFileTypes: true })) {
			const path = directory ? directory + '/' + entry.name : entry.name;
			const absolute = join(sync.local_path, path);

			if (entry.name.endsWith(partialSuffix)) {
				fs.rmSync(absolute, { force: true });
				continue;
			}

			const isDirectory = entry.isDirectory();
			if (!isDirectory && !entry.isFile()) {
				io.debug('Skipping symlink or special file: ' + path);
				continue;
			}

			const included = rules.includes(path, isDirectory);
			if (included) {
				const { size, mtimeMs } = fs.statSync(absolute);
				items.set(path, { directory: isDirectory, size, modifiedAt: mtimeMs });
			}
			if (isDirectory && (included || rules.shouldDescend(path))) walk(path);
		}
	}

	walk('');
	return items;
}

/** Updates a Sync's rules from the server, registering the folder with the server if needed. */
export async function pullRules(sync: Sync): Promise<void> {
	const remote = await getSync(sync.item).catch((e: Error & { status?: number }) => {
		if (e.status != 404) throw e;
		return createSync(sync.item, { rules: sync.rules }).catch((e: Error & { status?: number }) => {
			if (e.status != 409) throw e;
			return getSync(sync.item);
		});
	});
	sync.rules = remote.rules;
}

/** Fetches every item in a synced folder, including ones excluded by its rules. */
export async function fetchRemote(sync: Sync): Promise<Map<string, RemoteItem>> {
	const root = await getItemMetadata(sync.item);
	if (root.trashedAt) throw new Error(`The remote folder for ${sync.name} is in the trash`);

	const items = await fetchAPI('GET', 'storage/directory/:id/recursive', null, sync.item);

	return new Map(
		items.map(item => [
			item.path,
			{
				id: item.id,
				directory: item.type == 'inode/directory',
				hash: item.hash ?? null,
				size: Number(item.size),
				modifiedAt: item.modifiedAt,
				immutable: item.immutable,
			},
		])
	);
}

async function hashFile(path: string): Promise<string> {
	const hash = createHash('BLAKE2b512');
	for await (const chunk of fs.createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

export type SyncActionType = 'upload' | 'download' | 'delete_local' | 'delete_remote' | 'conflict';

export interface SyncAction {
	type: SyncActionType;
	path: string;
	local?: LocalItem;
	remote?: RemoteItem;
	/** A folder being trashed already covers this item */
	covered?: boolean;
	/** Local changes are being discarded */
	discardsLocal?: boolean;
}

export interface Delta {
	sync: Sync;
	rules: SyncRules;
	actions: SyncAction[];
	/** Updated as actions are applied */
	syncedItems: Map<string, SyncedItem>;
	localItems: Map<string, LocalItem>;
	remoteItems: Map<string, RemoteItem>;
	/** Remote folder IDs by path, including excluded folders */
	remoteFolders: Map<string, string>;
}

function toSyncedItem(local: LocalItem, remote: RemoteItem): SyncedItem {
	return { id: remote.id, hash: remote.directory ? null : remote.hash, size: local.size, modifiedAt: local.modifiedAt };
}

function remoteUnchanged(remote?: RemoteItem, synced?: SyncedItem): boolean {
	if (!remote || !synced) return !remote && !synced;
	if (remote.directory || synced.hash === null) return remote.directory && synced.hash === null;
	return remote.hash == synced.hash;
}

/** Finds what changed on each side since the last sync, treating a missing remote listing as unchanged. */
export async function computeDelta(sync: Sync, allRemoteItems: Map<string, RemoteItem> | null): Promise<Delta> {
	const rules = new SyncRules(sync.rules);

	let syncedItems: Map<string, SyncedItem>;
	try {
		syncedItems = new Map(Object.entries(io.readJSON(syncedStatePath(sync), SyncedState).items));
	} catch (e) {
		io.debug(`No synced state for ${sync.name}: ${io.errorText(e)}`);
		syncedItems = new Map();
	}

	for (const [path, item] of syncedItems) if (!rules.includes(path, item.hash === null)) syncedItems.delete(path);

	const localItems = scanLocal(sync, rules);

	allRemoteItems ??= new Map(
		syncedItems.entries().map(([path, item]) => [
			path,
			{
				id: item.id,
				directory: item.hash === null,
				hash: item.hash,
				size: item.size,
				modifiedAt: new Date(item.modifiedAt),
				immutable: false,
			},
		])
	);

	const remoteItems = new Map(allRemoteItems.entries().filter(([path, item]) => rules.includes(path, item.directory)));
	const remoteFolders = new Map<string, string>([['.', sync.item]]);
	for (const [path, item] of allRemoteItems) if (item.directory) remoteFolders.set(path, item.id);

	const hashes = new Map<string, string>();
	async function localHash(path: string): Promise<string> {
		if (!hashes.has(path)) hashes.set(path, await hashFile(join(sync.local_path, path)));
		return hashes.get(path)!;
	}

	async function localUnchanged(path: string, local?: LocalItem, synced?: SyncedItem): Promise<boolean> {
		if (!local || !synced) return !local && !synced;
		if (local.directory || synced.hash === null) return local.directory && synced.hash === null;
		if (local.size != synced.size) return false;
		return local.modifiedAt == synced.modifiedAt || (await localHash(path)) == synced.hash;
	}

	async function sameContent(path: string, local: LocalItem, remote: RemoteItem): Promise<boolean> {
		if (local.directory || remote.directory) return local.directory && remote.directory;
		return local.size == remote.size && (await localHash(path)) == remote.hash;
	}

	const paths = new Set([...syncedItems.keys(), ...localItems.keys(), ...remoteItems.keys()]).values().toArray().sort();
	const actions = new Map<string, SyncAction>();

	for (const path of paths) {
		const local = localItems.get(path),
			remote = remoteItems.get(path);
		let synced = syncedItems.get(path);

		if (synced?.deleted) {
			if (local && !remote) continue;
			syncedItems.delete(path);
			synced = undefined;
		}

		const addAction = (type: SyncActionType) => actions.set(path, { type, path, local, remote });

		if (local && remote && local.directory != remote.directory) {
			addAction('conflict');
			continue;
		}

		const localSame = await localUnchanged(path, local, synced),
			remoteSame = remoteUnchanged(remote, synced);

		if (localSame && remoteSame) {
			if (local && remote) syncedItems.set(path, toSyncedItem(local, remote));
		} else if (remoteSame) addAction(local ? 'upload' : 'delete_remote');
		else if (localSame) addAction(remote ? 'download' : 'delete_local');
		else if (!local && !remote) syncedItems.delete(path);
		else if (!local) addAction('download');
		else if (!remote) addAction('upload');
		else if (await sameContent(path, local, remote)) syncedItems.set(path, toSyncedItem(local, remote));
		else addAction('conflict');
	}

	const survives = (path: string, side: 'local' | 'remote'): boolean => {
		const action = actions.get(path);
		if (!action) return (side == 'local' ? localItems : remoteItems).has(path);
		return action.type != 'delete_local' && action.type != 'delete_remote';
	};

	for (const path of paths.toReversed()) {
		const action = actions.get(path);
		if (action?.type != 'delete_local' && action?.type != 'delete_remote') continue;
		if (!(action.local ?? action.remote)?.directory) continue;

		const side = action.type == 'delete_local' ? 'local' : 'remote';
		const descendants = paths.filter(descendant => descendant.startsWith(path + '/'));

		if (descendants.some(descendant => survives(descendant, side))) {
			action.type = side == 'local' ? 'upload' : 'download';
			continue;
		}

		if (side == 'local') continue;

		for (const descendant of descendants) {
			const descendantAction = actions.get(descendant);
			if (descendantAction?.type == 'delete_remote') descendantAction.covered = true;
		}
	}

	return { sync, rules, actions: actions.values().toArray(), syncedItems, localItems, remoteItems, remoteFolders };
}

const symbols: Record<SyncActionType, string> = {
	upload: styleText('green', '↑'),
	download: styleText('cyan', '↓'),
	delete_local: styleText('red', '✕'),
	delete_remote: styleText('red', '✕'),
	conflict: styleText('yellow', '!'),
};

const descriptions: Record<SyncActionType, string> = {
	upload: 'upload',
	download: 'download',
	delete_local: 'delete locally',
	delete_remote: 'delete remotely',
	conflict: 'conflict',
};

export function describeAction(action: SyncAction): string {
	return `${symbols[action.type]} ${action.path} ${styleText('dim', `(${descriptions[action.type]})`)}`;
}

export function summarizeActions(actions: SyncAction[]): string {
	const counts = Object.groupBy(actions, action => action.type);
	return Object.entries(counts)
		.map(([type, list]) => `${symbols[type as SyncActionType]} ${list.length} ${descriptions[type as SyncActionType]}`)
		.join(', ');
}

export type ConflictMode = 'ask' | 'local' | 'remote' | 'both' | 'skip';

type ConflictResolution = Exclude<ConflictMode, 'ask'>;

export interface SyncOptions {
	conflicts: ConflictMode;
	dryRun: boolean;
	verbose: boolean;
	/** Overrides the Sync's `trash` setting */
	trash?: boolean;
}

export interface SyncStats {
	completed: SyncAction[];
	skipped: SyncAction[];
	failed: SyncAction[];
}

function describeItem(item: LocalItem | RemoteItem): string {
	if (item.directory) return 'folder';
	return `${formatBytes(item.size)}, modified ${io.prettyDate(new Date(item.modifiedAt))}`;
}

async function showDiff(delta: Delta, action: SyncAction): Promise<void> {
	using tmp = fs.mkdtempDisposableSync(join(tmpdir(), 'axium-sync-'));
	const remoteCopy = join(tmp.path, basename(action.path));
	await streamWrite(remoteCopy, await downloadItemStream(action.remote!.id));
	const local = join(delta.sync.local_path, action.path);
	// @todo don't rely on system-wide git being installed
	const git = spawnSync('git', ['diff', '--no-index', '--', remoteCopy, local], { stdio: 'inherit' });
	if (git.error) spawnSync('diff', ['-u', '--label', 'remote', '--label', 'local', remoteCopy, local], { stdio: 'inherit' });
}

async function askConflict(delta: Delta, action: SyncAction): Promise<ConflictResolution> {
	const { local, remote } = action as Required<SyncAction>;

	console.log(styleText(['yellow', 'bold'], 'Conflict: ') + action.path);
	console.log('  Local:  ' + describeItem(local));
	console.log('  Remote: ' + describeItem(remote));

	if (local.directory != remote.directory) {
		io.warn('One side is a file and the other is a folder. Rename or remove one of them, then sync again.');
		return 'skip';
	}

	while (true) {
		const choice = await io.select<ConflictResolution | 'diff'>('How should this conflict be resolved?', [
			{ name: `Keep both (rename local to ${basename(action.path)}.conflict`, value: 'both' },
			{ name: 'Keep local (overwrite remote)', value: 'local' },
			{ name: 'Keep remote (overwrite local)', value: 'remote' },
			{ name: 'Show differences', value: 'diff' },
			{ name: 'Skip', value: 'skip' },
		]);
		if (choice != 'diff') return choice;
		await showDiff(delta, action);
	}
}

/** Throws if a local item changed after it was scanned. */
function assertUnchanged(absolute: string, expected?: LocalItem): void {
	const stats = fs.statSync(absolute, { throwIfNoEntry: false });
	if (!stats && !expected) return;
	if (stats && expected && (expected.directory || (stats.size == expected.size && stats.mtimeMs == expected.modifiedAt))) return;
	throw new Error('Changed locally during sync, it will be synced next time');
}

async function remoteParent(delta: Delta, path: string): Promise<string> {
	const directory = dirname(path);
	const existing = delta.remoteFolders.get(directory);
	if (existing) return existing;
	const created = await createDirectory(basename(directory), await remoteParent(delta, directory));
	delta.remoteFolders.set(directory, created.id);
	return created.id;
}

async function upload(delta: Delta, action: SyncAction): Promise<void> {
	const { path, local, remote } = action;
	if (!local) throw new Error('Bug! Uploading without a local item');

	if (local.directory) {
		const folder = remote ?? (await createDirectory(basename(path), await remoteParent(delta, path)));
		delta.remoteFolders.set(path, folder.id);
		delta.syncedItems.set(path, { id: folder.id, hash: null, size: 0, modifiedAt: 0 });
		return;
	}

	const absolute = join(delta.sync.local_path, path);
	const stream = local.size ? streamRead(absolute, 0, local.size - 1) : new Blob([]).stream();
	const init = { size: local.size, modifiedAt: new Date(local.modifiedAt) };

	if (remote?.immutable) await updateItemMetadata(remote.id, { trash: true });

	const item =
		remote && !remote.immutable
			? await updateItem(remote.id, stream, init)
			: await createItem(stream, {
					...init,
					name: basename(path),
					parentId: await remoteParent(delta, path),
					type: mime.getType(path) || 'application/octet-stream',
				});

	delta.syncedItems.set(path, { id: item.id, hash: item.hash ?? null, size: local.size, modifiedAt: local.modifiedAt });
}

async function download(delta: Delta, action: SyncAction, options: SyncOptions): Promise<void> {
	const { path, local, remote } = action;
	if (!remote) throw new Error('Bug! Downloading without a remote item');

	const absolute = join(delta.sync.local_path, path);

	if (remote.directory) {
		fs.mkdirSync(absolute, { recursive: true });
		delta.syncedItems.set(path, { id: remote.id, hash: null, size: 0, modifiedAt: 0 });
		return;
	}

	fs.mkdirSync(dirname(absolute), { recursive: true });
	const partial = join(dirname(absolute), '.' + basename(absolute) + partialSuffix);
	const hash = createHash('BLAKE2b512');
	const hashing = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			hash.update(chunk);
			controller.enqueue(chunk);
		},
	});

	try {
		await streamWrite(partial, (await downloadItemStream(remote.id)).pipeThrough(hashing), remote.modifiedAt);
		if (hash.digest('hex') != remote.hash) throw new Error('Downloaded content does not match the remote hash');
		assertUnchanged(absolute, local);
		if (action.discardsLocal && options.trash) moveToTrash(absolute, true);
		fs.renameSync(partial, absolute);
	} finally {
		fs.rmSync(partial, { force: true });
	}

	const { size, mtimeMs } = fs.statSync(absolute);
	delta.syncedItems.set(path, { id: remote.id, hash: remote.hash, size, modifiedAt: mtimeMs });
}

function delete_local(delta: Delta, action: SyncAction, options: SyncOptions): void {
	const absolute = join(delta.sync.local_path, action.path);
	assertUnchanged(absolute, action.local);

	if (!action.local?.directory) {
		if (options.trash) moveToTrash(absolute);
		else fs.unlinkSync(absolute);
		delta.syncedItems.delete(action.path);
		return;
	}

	try {
		fs.rmdirSync(absolute);
	} catch (e: any) {
		if (e.code != 'ENOTEMPTY') throw e;
		delta.syncedItems.set(action.path, { ...delta.syncedItems.get(action.path)!, deleted: true });
		io.warn(`${action.path} was deleted remotely, but was kept locally since it contains files that are not synced`);
		return;
	}

	delta.syncedItems.delete(action.path);
}

async function delete_remote(delta: Delta, action: SyncAction): Promise<void> {
	if (!action.covered) await updateItemMetadata(action.remote!.id, { trash: true });
	delta.syncedItems.delete(action.path);
}

/** Turns a conflict into the actions that resolve it, failing to keep both if an unresolved conflict copy exists. */
function resolveConflict(delta: Delta, action: SyncAction, resolution: ConflictResolution): SyncAction[] {
	switch (resolution) {
		case 'skip':
			return [];
		case 'local':
			return [{ ...action, type: 'upload' }];
		case 'remote':
			return [{ ...action, type: 'download', discardsLocal: true }];
		case 'both': {
			const copy = action.path + '.conflict';
			if (delta.remoteItems.has(copy)) throw new Error(`An unresolved conflict copy already exists remotely: ${copy}`);
			try {
				fs.linkSync(join(delta.sync.local_path, action.path), join(delta.sync.local_path, copy));
			} catch (e: any) {
				if (e.code == 'EEXIST') throw new Error(`An unresolved conflict copy already exists: ${copy}`, { cause: e });
				throw e;
			}
			const resolved: SyncAction[] = [{ ...action, type: 'download' }];
			if (delta.rules.includes(copy, false)) resolved.push({ type: 'upload', path: copy, local: action.local });
			return resolved;
		}
	}
}

const appliers: Record<
	Exclude<SyncActionType, 'conflict'>,
	(delta: Delta, action: SyncAction, options: SyncOptions) => Promise<void> | void
> = {
	upload,
	download,
	delete_local,
	delete_remote,
};

async function resolveConflicts(delta: Delta, options: SyncOptions, stats: SyncStats): Promise<SyncAction[]> {
	const actions: SyncAction[] = [];

	for (const action of delta.actions) {
		if (action.type != 'conflict') {
			actions.push(action);
			continue;
		}

		try {
			const resolution =
				options.conflicts == 'ask'
					? await askConflict(delta, action)
					: action.local!.directory != action.remote!.directory
						? 'skip'
						: options.conflicts;
			const resolved = resolveConflict(delta, action, resolution);
			if (!resolved.length) stats.skipped.push(action);
			actions.push(...resolved);
		} catch (e) {
			io.error(`${action.path}: ${io.errorText(e)}`);
			stats.failed.push(action);
		}
	}

	const byPath = (a: SyncAction, b: SyncAction) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	const isTransfer = (action: SyncAction) => action.type == 'upload' || action.type == 'download';

	return [...actions.filter(isTransfer).sort(byPath), ...actions.filter(action => !isTransfer(action)).sort((a, b) => byPath(b, a))];
}

export async function doSync(sync: Sync, options: SyncOptions): Promise<SyncStats> {
	using _ = lock(sync);

	options = { ...options, trash: options.trash ?? sync.trash ?? hasTrash() };

	const [remote] = await io.track('Fetching ' + sync.name, Promise.all([fetchRemote(sync), pullRules(sync)]));
	const delta = await io.track('Comparing ' + sync.name, computeDelta(sync, remote));
	const stats: SyncStats = { completed: [], skipped: [], failed: [] };

	if (options.dryRun) {
		for (const action of delta.actions) console.log(describeAction(action));
		return stats;
	}

	try {
		const actions = await resolveConflicts(delta, options, stats);

		if (!options.verbose && actions.length) io.start('Syncing ' + sync.name);

		for (const [i, action] of actions.entries()) {
			if (options.verbose) io.start(describeAction(action));
			else io.progress(i, actions.length, action.path);

			try {
				await appliers[action.type as keyof typeof appliers](delta, action, options);
				if (options.verbose) io.done();
				stats.completed.push(action);
			} catch (e) {
				if (options.verbose) io.done(true);
				io.error(options.verbose ? io.errorText(e) : `${action.path}: ${io.errorText(e)}`);
				stats.failed.push(action);
			}
		}
		if (!options.verbose && actions.length) io.progress(actions.length, actions.length, 'Done');
	} finally {
		fs.mkdirSync(dirname(syncedStatePath(sync)), { recursive: true });
		io.writeJSON(syncedStatePath(sync), { items: Object.fromEntries(delta.syncedItems) });
	}

	if (!stats.failed.length) sync.last_synced = new Date();

	await updateSyncDevice(sync.item, { host: hostname(), localPath: sync.local_path, lastSynced: sync.last_synced }).catch(e =>
		io.warn('Could not report sync status: ' + io.errorText(e))
	);

	const summary = [
		stats.completed.length && summarizeActions(stats.completed),
		stats.skipped.length && styleText('yellow', `${stats.skipped.length} conflict(s) skipped`),
		stats.failed.length && styleText('red', `${stats.failed.length} failed`),
	].filter(Boolean);

	console.log(`${sync.name}: ${summary.length ? summary.join(', ') : 'up to date'}`);

	return stats;
}
