import { errorText, warn } from 'ioium';

export type InstallPhase = 'installing' | 'pending' | 'active' | 'failed' | 'none';

/** A message sent from a page to the service worker. */
export type PageMessage = { type: 'activate' } | { type: 'status' };

export interface WorkerInstalled {
	type: 'install';
	version: string;
	base: string;
	error: string | null;
}

export interface WorkerUpdateActivated {
	type: 'update';
	version: string;
	base: string;
}

export type WorkerMessage = WorkerInstalled | WorkerUpdateActivated;

export interface Status {
	/** Whether a worker is serving this page. False until the first registration activates. */
	controlled: boolean;
	/** A new build is downloading right now. */
	downloading: boolean;
	/** A new build has finished downloading and is waiting for {@link activate}. */
	updateReady: boolean;
	/** The last registration or precache failure. */
	error: string | null;

	readonly installPhase: InstallPhase;
}

export const supported = typeof navigator != 'undefined' && 'serviceWorker' in navigator;

export const state: Status = {
	controlled: supported && !!navigator.serviceWorker.controller,
	downloading: false,
	updateReady: false,
	error: null,
	get installPhase(): InstallPhase {
		if (state.downloading) return 'installing';
		if (state.updateReady) return 'pending';
		return state.controlled ? 'active' : 'none';
	},
};

const listeners = new Set<(status: Status) => void>();

export function subscribe(listener: (status: Status) => void): () => void {
	listeners.add(listener);
	listener(state);
	return () => listeners.delete(listener);
}

function change(changes: Partial<Status>): void {
	Object.assign(state, changes);
	for (const listener of listeners) listener(state);
}

let registration: ServiceWorkerRegistration | null | undefined = null;

/** Set by {@link activate}, so only an update the user asked for reloads the page. */
let needsReload = false;

function track(worker: ServiceWorker): void {
	const check = () => {
		switch (worker.state) {
			case 'installing':
				change({ downloading: true, updateReady: false });
				break;
			case 'installed':
				change({ downloading: false, updateReady: !!navigator.serviceWorker.controller });
				break;
			case 'activated':
				change({ downloading: false, updateReady: false, controlled: true });
				break;
			case 'redundant':
				change({ downloading: false, updateReady: false });
				break;
		}
	};

	worker.addEventListener('statechange', check);
	check();
}

function formatVersion(timestamp: string): string {
	if (!/^\d+$/.test(timestamp)) return timestamp;
	const pretty = new Date(Number(timestamp)).toISOString().split('.')[0];
	return `${pretty} (${timestamp})`;
}

/** Register the service worker. Idempotent. */
export async function register(url = '/service-worker.js', options: RegistrationOptions = {}): Promise<ServiceWorkerRegistration | null> {
	if (!supported) return null;

	console.debug('pwa: registering service worker');

	navigator.serviceWorker.addEventListener('message', event => {
		const message = event.data as WorkerMessage;

		switch (message?.type) {
			case 'install':
				console.debug('pwa: installed', formatVersion(message.version));
				change({ error: message.error ?? null });
				break;
			case 'update':
				console.debug('pwa: updated service worker to', formatVersion(message.version));
				break;
			default:
				warn('Unknown message from service worker:', message);
		}
	});

	navigator.serviceWorker.addEventListener('controllerchange', () => {
		change({ controlled: !!navigator.serviceWorker.controller, updateReady: false });
		if (needsReload) location.reload();
	});

	try {
		registration = await navigator.serviceWorker.register(url, { ...options, type: 'module' });
	} catch (e: any) {
		console.error(e);
		change({ error: errorText(e) });
		return null;
	}

	if (registration.installing) track(registration.installing);
	if (registration.waiting) change({ updateReady: true });

	registration.addEventListener('updatefound', () => {
		console.debug('pwa: updating');
		if (registration?.installing) track(registration.installing);
	});

	try {
		const cacheKeys = await caches.keys();
		const timestamps = cacheKeys.filter(k => k.startsWith('axium@')).map(k => k.slice('axium@'.length));
		console.debug('pwa: service worker version(s):', timestamps.map(formatVersion).join(', '));
	} catch (e) {
		console.debug('pwa: could not get service worker versions,', errorText(e));
	}

	return registration;
}

/** Remove the worker and everything it cached. Used when the `pwa` feature is turned off. */
export async function unregister(): Promise<void> {
	if (!supported) return;

	registration ??= await navigator.serviceWorker.getRegistration();
	await registration?.unregister();
	registration = null;

	for (const key of await caches.keys()) {
		if (key.startsWith('axium@')) await caches.delete(key);
	}

	change({ controlled: false, downloading: false, updateReady: false });
}

export async function update(): Promise<void> {
	if (!navigator.onLine) console.debug('pwa: can not check for updates while offline');

	console.debug('pwa: checking for updates');
	await registration?.update();
}

/**
 * Apply a downloaded update.
 * Tell the waiting worker to take over then reload.
 * Does nothing when no update is pending.
 */
export function activate(): void {
	const waiting = registration?.waiting;
	if (!waiting) return;

	console.debug('pwa: activating service worker update');
	needsReload = true;
	waiting.postMessage({ type: 'activate' });
}
