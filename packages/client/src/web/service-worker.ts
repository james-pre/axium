import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { asset, resolve } from '$app/paths';
import type { PushNotification } from '@axium/core/notifications';
import type { PageMessage } from './pwa.js';

/// <reference no-default-lib="true"/>
/// <reference lib="webworker" />

// eslint-disable-next-line no-shadow-restricted-names
declare const globalThis: ServiceWorkerGlobalScope;

const cacheName = 'axium@' + version;

const versionFile = resolve('_app/version.json'),
	shell = resolve('_axium/shell');

const build = immutable.map(({ path }) => resolve(path));

const precache = new Set([...build, ...assets.map(({ path }) => asset(path)), shell]);

async function install(): Promise<void> {
	let error = null;
	try {
		const cache = await caches.open(cacheName);
		await Promise.all(Array.from(precache).map(url => cache.add(new Request(url, build.includes(url) ? {} : { cache: 'no-cache' }))));
	} catch (e: any) {
		error = e instanceof Error ? e.message : String(e);
		await caches.delete(cacheName);
		throw e;
	} finally {
		const clients = await globalThis.clients.matchAll({ includeUncontrolled: true, type: 'window' });
		for (const client of clients) client.postMessage({ type: 'install', version, error });
	}
}

globalThis.addEventListener('install', event => event.waitUntil(install()));

async function activate(): Promise<void> {
	await Promise.all((await caches.keys()).filter(key => key.startsWith('axium@') && key !== cacheName).map(key => caches.delete(key)));
	await globalThis.clients.claim();
	const clients = await globalThis.clients.matchAll({ includeUncontrolled: true, type: 'window' });
	for (const client of clients) client.postMessage({ type: 'update', version });
}

globalThis.addEventListener('activate', event => event.waitUntil(activate()));

async function maybeCached(request: Request): Promise<Response> {
	const { pathname } = new URL(request.url);

	const cache = await caches.open(cacheName);

	const hit = await cache.match(pathname);
	if (hit) return hit;

	const response = await fetch(request);
	if (response.ok && response.status != 206) await cache.put(pathname, response.clone());
	return response;
}

globalThis.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method != 'GET') return;

	const url = new URL(request.url);
	if (url.origin != location.origin || url.pathname == versionFile) return;

	if (request.mode == 'navigate') {
		const res = fetch(request).catch(async e => {
			const hit = await caches.match(shell, { cacheName });
			if (hit) return hit;
			throw e;
		});
		return event.respondWith(res);
	}

	// @todo API responses, `/raw`.
	if (!precache.has(url.pathname)) return;

	event.respondWith(maybeCached(request));
});

globalThis.addEventListener('push', event => {
	const notification = event.data?.json() as PushNotification | undefined;
	if (!notification?.title) return;

	const { title, url, ...options } = notification;
	event.waitUntil(globalThis.registration.showNotification(title, { ...options, data: { url } }));
});

async function open(url: string): Promise<void> {
	const windows = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true });
	const existing = windows.find(client => client.url == url);
	if (existing) await existing.focus();
	else await globalThis.clients.openWindow(url);
}

globalThis.addEventListener('notificationclick', event => {
	event.notification.close();
	const url = new URL(event.notification.data?.url ?? '/', location.origin).href;
	event.waitUntil(open(url));
});

async function resubscribe(event: PushSubscriptionChangeEvent): Promise<void> {
	const subscription =
		event.newSubscription ?? (event.oldSubscription && (await globalThis.registration.pushManager.subscribe(event.oldSubscription.options)));
	if (!subscription) return;

	await fetch(resolve('api/session/push'), {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(subscription),
	});
}

globalThis.addEventListener('pushsubscriptionchange', event => event.waitUntil(resubscribe(event)));

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
