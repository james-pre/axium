import type { PushSubscriptionInit } from '@axium/core/notifications';
import { fetchAPI } from '../requests.js';

export const supported =
	typeof window != 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** This device's push subscription, if it has one. */
export async function getSubscription(): Promise<PushSubscription | null> {
	if (!supported) return null;
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Ask for permission, then subscribe this device for the current session. */
export async function subscribe(): Promise<PushSubscription> {
	if (!supported) throw new Error('Push notifications are not supported by this browser');

	const { publicKey } = await fetchAPI('GET', 'push');
	if (!publicKey) throw new Error('Push notifications are not set up on this server');

	if ((await Notification.requestPermission()) != 'granted') throw new Error('Notification permission was denied');

	const { pushManager } = await navigator.serviceWorker.ready;
	const subscription = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
	await fetchAPI('PUT', 'session/push', subscription.toJSON() as PushSubscriptionInit);
	return subscription;
}

export async function unsubscribe(): Promise<void> {
	const subscription = await getSubscription();
	if (!subscription) return;

	await fetchAPI('DELETE', 'session/push', { endpoint: subscription.endpoint });
	await subscription.unsubscribe();
}

/** Register an existing subscription with the current session, e.g. after logging in again. */
export async function sync(): Promise<void> {
	const subscription = await getSubscription();
	if (!subscription || Notification.permission != 'granted') return;

	await fetchAPI('PUT', 'session/push', subscription.toJSON() as PushSubscriptionInit);
}
