import { onConnect } from '@axium/client/socket';
import { onSync } from '@axium/client/sync';
import type { SyncDiff } from '@axium/core';
import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path/posix';
import { StorageItemMetadata } from '../common.js';
import { SyncRules } from '../rules.js';
import { configPath, readConfig, updateSyncConfig } from './config.js';
import { getItems } from './local.js';
import { doSync, partialSuffix, readSyncedItems, type Sync, type SyncedItem, type SyncFrequency } from './sync.js';

/** The longest changes wait before being synced, by frequency, in milliseconds */
const maxWaits: Record<Exclude<SyncFrequency, 'manual'>, number> = {
	asap: 5 * 60_000,
	'1m': 60_000,
	'5m': 5 * 60_000,
	'15m': 15 * 60_000,
	'1h': 3600_000,
	'1d': 24 * 3600_000,
};

/** How long a folder must go without changes before syncing as soon as possible, in milliseconds */
const settleDelay = 2000;

/** How often a folder is synced in case a change was missed, in milliseconds */
const fallbackInterval = 15 * 60_000;

/** How long to wait before retrying a failed sync, in milliseconds */
const retryDelay = 60_000;

/** Whether a local path is the same as when it was last synced. */
function unchangedSinceSync(sync: Sync, synced: Map<string, SyncedItem>, path: string): boolean {
	const stats = fs.statSync(join(sync.local_path, path), { throwIfNoEntry: false });
	const item = synced.get(path);
	if (!stats || !item) return !stats && !item;
	if (stats.isDirectory()) return item.hash === null;
	return stats.size == item.size && stats.mtimeMs == item.modifiedAt;
}

/** Keeps one synced folder in sync while the daemon runs. */
class AutoSync implements Disposable {
	protected watcher?: fs.FSWatcher;
	protected timer?: NodeJS.Timeout;
	protected retryTimer?: NodeJS.Timeout;
	protected fallbackTimer?: NodeJS.Timeout;
	/** When the earliest change that has not been synced yet happened */
	protected firstChange?: number;
	protected running = false;
	protected rerun = false;
	/** Local paths that changed since the last sync */
	protected changedPaths = new Set<string>();
	/** Whether the server needs to be checked, rather than only local changes */
	protected checkRemote = false;
	protected rules!: SyncRules;
	/** The parent ID, name, and hash of each item when the folder was last synced, by ID */
	protected known = new Map<string, string>();

	constructor(public sync: Sync) {
		this.update(sync);
	}

	protected get maxWait(): number {
		return maxWaits[this.sync.frequency as Exclude<SyncFrequency, 'manual'>];
	}

	/** Applies new settings, restarting the watcher if the local path changed. */
	update(sync: Sync): void {
		const restart = !this.watcher || sync.local_path != this.sync.local_path;
		const frequencyChanged = sync.frequency != this.sync?.frequency;
		this.sync = sync;
		this.rules = new SyncRules(sync.rules);
		this.loadKnown();

		if (frequencyChanged) {
			clearInterval(this.fallbackTimer);
			this.fallbackTimer = setInterval(() => this.request(), Math.max(fallbackInterval, this.maxWait));
		}

		if (!restart) return;
		this.watcher?.close();
		this.watch();
	}

	protected loadKnown(): void {
		const synced = readSyncedItems(this.sync);
		this.known.clear();
		for (const [path, item] of synced) {
			const parentId = dirname(path) == '.' ? this.sync.item : synced.get(dirname(path))?.id;
			this.known.set(item.id, JSON.stringify([parentId, basename(path), item.hash]));
		}
	}

	protected watch(): void {
		try {
			this.watcher = fs.watch(this.sync.local_path, { recursive: true }, (_, filename) => {
				if (!filename || filename.endsWith(partialSuffix)) return;
				if (!this.rules.includes(filename, false) && !this.rules.includes(filename, true)) return;
				this.changedPaths.add(filename);
				this.schedule();
			});
			this.watcher.on('error', e => io.error(`${this.sync.name}: Stopped watching for changes: ${io.errorText(e)}`));
		} catch (e) {
			io.error(`${this.sync.name}: Could not watch for changes: ${io.errorText(e)}`);
		}
	}

	/** Whether a pushed change is to an item in this folder that this device did not cause. */
	isRemoteChange(item: StorageItemMetadata, parents: Map<string, string | null>): boolean {
		const key = JSON.stringify([item.parentId, item.name, item.hash ?? null]);
		if (!item.trashedAt && this.known.get(item.id) == key) return false;

		for (let id: string | null | undefined = item.id; id; id = parents.get(id) ?? (id == item.id ? item.parentId : null)) {
			if (id == this.sync.item) return true;
		}
		return false;
	}

	isKnown(id: string): boolean {
		return this.known.has(id);
	}

	/** Syncs within the time allowed by the frequency, or immediately. */
	schedule(immediately: boolean = false): void {
		const now = Date.now();
		this.firstChange ??= now;
		const deadline = this.firstChange + this.maxWait;
		const wait = this.sync.frequency == 'asap' ? Math.min(now + settleDelay, deadline) - now : deadline - now;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.run(), immediately ? 0 : Math.max(0, wait));
	}

	/** Syncs with the server, even if nothing changed locally. */
	request(immediately: boolean = false): void {
		this.checkRemote = true;
		this.schedule(immediately);
	}

	protected async run(): Promise<void> {
		clearTimeout(this.timer);
		clearTimeout(this.retryTimer);
		this.firstChange = undefined;

		if (this.running) {
			this.rerun = true;
			return;
		}

		const synced = readSyncedItems(this.sync);
		const changed = [...this.changedPaths].some(path => !unchangedSinceSync(this.sync, synced, path));
		this.changedPaths.clear();

		if (!changed && !this.checkRemote) return;
		this.checkRemote = false;
		this.running = true;

		try {
			await doSync(this.sync, { conflicts: 'both', dryRun: false, verbose: true });
			updateSyncConfig(this.sync.item, { last_synced: this.sync.last_synced, rules: this.sync.rules });
			this.rules = new SyncRules(this.sync.rules);
			this.loadKnown();
		} catch (e) {
			io.error(`${this.sync.name}: ${io.errorText(e)}`);
			this.retryTimer = setTimeout(() => this.request(true), retryDelay);
		} finally {
			this.running = false;
		}

		if (!this.rerun) return;
		this.rerun = false;
		this.schedule();
	}

	[Symbol.dispose](): void {
		this.watcher?.close();
		clearTimeout(this.timer);
		clearTimeout(this.retryTimer);
		clearInterval(this.fallbackTimer);
	}
}

const autoSyncs = new Map<string, AutoSync>();

/** Starts, updates, or stops automatic syncing to match the saved config. */
function reconcile(): void {
	const syncs = new Map(
		readConfig()
			.sync.filter(sync => sync.frequency != 'manual')
			.map(sync => [sync.item, sync])
	);

	for (const [item, auto] of autoSyncs) {
		if (syncs.has(item)) continue;
		auto[Symbol.dispose]();
		autoSyncs.delete(item);
		io.info(`${auto.sync.name}: Stopped syncing automatically`);
	}

	for (const [item, sync] of syncs) {
		const existing = autoSyncs.get(item);
		if (existing) {
			existing.update(sync);
			continue;
		}

		const auto = new AutoSync(sync);
		autoSyncs.set(item, auto);
		io.info(`${sync.name}: Syncing automatically`);
		auto.request(true);
	}
}

function onRemoteChanges(diff: SyncDiff): void {
	const changed = [...diff.created, ...diff.updated].flatMap(object => {
		if (object.$type != 'storage') return [];
		const parsed = StorageItemMetadata.safeParse(object);
		return parsed.success ? [parsed.data] : [];
	});
	if (!changed.length && !diff.deleted.length) return;

	const parents = new Map(getItems().map(item => [item.id, item.parentId]));

	for (const auto of autoSyncs.values()) {
		if (changed.some(item => auto.isRemoteChange(item, parents)) || diff.deleted.some(id => auto.isKnown(id))) auto.request();
	}
}

/** Keeps every folder with automatic syncing in sync until the process exits. */
export function startAutoSync(): void {
	reconcile();

	let reloadTimer: NodeJS.Timeout | undefined;
	fs.watch(dirname(configPath), (_, filename) => {
		if (filename != basename(configPath)) return;
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(reconcile, 500);
	});

	onSync(onRemoteChanges);
	onConnect(() => {
		for (const auto of autoSyncs.values()) auto.request(true);
	});
}
