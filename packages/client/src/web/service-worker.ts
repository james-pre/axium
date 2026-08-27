/* eslint-disable @typescript-eslint/no-misused-promises */
import { base, build, files, version } from '$service-worker';
import type { PageMessage } from './pwa.js';

/// <reference no-default-lib="true"/>
/// <reference lib="webworker" />

// eslint-disable-next-line no-shadow-restricted-names
declare const globalThis: ServiceWorkerGlobalScope;

const cacheName = 'axium@' + version;

const versionFile = `${base}/_app/version.json`;

const precache = new Set([...build, ...files]);

async function install(): Promise<void> {
	let error = null;
	try {
		const cache = await caches.open(cacheName);
		await Promise.all(Array.from(precache).map(url => cache.add(new Request(url, files.includes(url) ? { cache: 'no-cache' } : {}))));
	} catch (e: any) {
		error = e instanceof Error ? e.message : String(e);
		await caches.delete(cacheName);
		throw e;
	} finally {
		const clients = await globalThis.clients.matchAll({ includeUncontrolled: true, type: 'window' });
		for (const client of clients) client.postMessage({ type: 'install', version, base, error });
	}
}

globalThis.addEventListener('install', event => event.waitUntil(install()));

async function activate(): Promise<void> {
	await Promise.all((await caches.keys()).filter(key => key.startsWith('axium@') && key !== cacheName).map(key => caches.delete(key)));
	await globalThis.clients.claim();
	const clients = await globalThis.clients.matchAll({ includeUncontrolled: true, type: 'window' });
	for (const client of clients) client.postMessage({ type: 'update', version, base });
}

globalThis.addEventListener('activate', event => event.waitUntil(activate()));

globalThis.addEventListener('fetch', async event => {
	const { request } = event;

	if (request.method != 'GET') return;

	const url = new URL(request.url);
	if (url.origin != location.origin) return;
	if (url.pathname == versionFile) return;

	// @todo API responses, `/raw`.
	if (!precache.has(url.pathname)) return;

	const cache = await caches.open(cacheName);

	const hit = await cache.match(url.pathname);
	if (hit) return event.respondWith(hit);

	const response = await fetch(request);
	if (response.ok && response.status != 206) await cache.put(url.pathname, response.clone());
	return event.respondWith(response);
});

globalThis.addEventListener('message', (event: ExtendableMessageEvent & { data: PageMessage }) => {
	if (!event.data) console.warn('Ignoring invalid message (no data)');

	switch (event.data?.type) {
		case 'status':
			event.source?.postMessage(status);
			break;
		case 'activate':
			console.log('activating update');
			void globalThis.skipWaiting();
			break;
	}
});

console.log('version is', version);
