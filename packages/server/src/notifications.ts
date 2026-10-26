import type { PushNotification } from '@axium/core/notifications';
import * as io from 'ioium/node';
import type { Selectable } from 'kysely';
import {
	createCipheriv,
	createECDH,
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
	hkdfSync,
	randomBytes,
	sign,
	type ECDH,
	type KeyObject,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import config from './config.js';
import { database, type Schema } from './db/index.js';
import { encodeUTF8 } from 'utilium';

const base64url = { alphabet: 'base64url', omitPadding: true } as const;

function concat(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const result = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0));
	let offset = 0;
	for (const array of arrays) {
		result.set(array, offset);
		offset += array.length;
	}
	return result;
}

interface VapidKey {
	privateKey: KeyObject;
	/** Uncompressed P-256 point, base64url encoded */
	publicKey: string;
}

let vapidKey: VapidKey | null | undefined;

function loadKey(): VapidKey | null {
	if (vapidKey !== undefined) return vapidKey;

	try {
		const privateKey = createPrivateKey(readFileSync(config.push.key_file, 'utf8'));
		if (privateKey.asymmetricKeyDetails?.namedCurve != 'prime256v1') throw new Error('Key must be an EC P-256 key');
		const { x, y } = createPublicKey(privateKey).export({ format: 'jwk' });
		const point = concat(Uint8Array.of(4), Uint8Array.fromBase64(x!, base64url), Uint8Array.fromBase64(y!, base64url));
		vapidKey = { privateKey, publicKey: point.toBase64(base64url) };
	} catch (e) {
		io.debug('Push notifications are disabled:', io.errorText(e));
		vapidKey = null;
	}

	return vapidKey;
}

/** The VAPID public key browsers subscribe with, or `null` if push notifications are not set up. */
export function publicKey(): string | null {
	return loadKey()?.publicKey ?? null;
}

export function generateKey(path: string): void {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	writeFileSync(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}

function base64urlJSON(value: object): string {
	return encodeUTF8(JSON.stringify(value)).toBase64(base64url);
}

/** The `Authorization` header for a push service (RFC 8292) */
function vapidAuthorization(endpoint: string, key: VapidKey): string {
	const claims = {
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1000) + 12 * 3600,
		sub: config.push.subject || config.origin,
	};
	const unsigned = base64urlJSON({ typ: 'JWT', alg: 'ES256' }) + '.' + base64urlJSON(claims);
	const signature = sign('sha256', encodeUTF8(unsigned), { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
	return `vapid t=${unsigned}.${signature.toBase64(base64url)}, k=${key.publicKey}`;
}

/** Push services only have to accept message bodies up to this size, in bytes */
const recordSize = 4096;

/** Salt, record size, key ID length, sender key, delimiter, and authentication tag */
const overhead = 16 + 4 + 1 + 65 + 1 + 16;

/**
 * Encrypt a message body for a subscription (RFC 8291), as a single aes128gcm record.
 * @internal
 */
export function encrypt(
	plaintext: Uint8Array,
	receiverKey: Uint8Array,
	authSecret: Uint8Array,
	sender: ECDH,
	salt: Uint8Array
): Uint8Array<ArrayBuffer> {
	const senderKey = sender.getPublicKey();
	const keyInfo = concat(encodeUTF8('WebPush: info\0'), receiverKey, senderKey);
	const inputKey = new Uint8Array(hkdfSync('sha256', sender.computeSecret(receiverKey), authSecret, keyInfo, 32));
	const contentKey = new Uint8Array(hkdfSync('sha256', inputKey, salt, 'Content-Encoding: aes128gcm\0', 16));
	const nonce = new Uint8Array(hkdfSync('sha256', inputKey, salt, 'Content-Encoding: nonce\0', 12));

	const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
	const ciphertext = concat(cipher.update(plaintext), cipher.update(Uint8Array.of(2)), cipher.final(), cipher.getAuthTag());

	const header = new Uint8Array(21);
	header.set(salt);
	const view = new DataView(header.buffer);
	view.setUint32(16, recordSize);
	view.setUint8(20, senderKey.length);

	return concat(header, senderKey, ciphertext);
}

/** How long push services keep undelivered notifications, in seconds */
const ttl = 86400;

async function send(subscription: Selectable<Schema['push_subscriptions']>, payload: Uint8Array, key: VapidKey): Promise<void> {
	const sender = createECDH('prime256v1');
	sender.generateKeys();

	const body = encrypt(
		payload,
		Uint8Array.fromBase64(subscription.p256dh, base64url),
		Uint8Array.fromBase64(subscription.auth, base64url),
		sender,
		randomBytes(16)
	);

	const response = await fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			Authorization: vapidAuthorization(subscription.endpoint, key),
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream',
			TTL: ttl.toString(),
		},
		body,
	});

	if (response.status == 404 || response.status == 410) {
		await database.deleteFrom('push_subscriptions').where('endpoint', '=', subscription.endpoint).execute();
		return;
	}

	if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
}

/**
 * Send a push notification to every device the users subscribed with.
 * Failures are logged rather than thrown.
 * @category Plugin API
 */
export async function notify(userIds: string | string[], notification: PushNotification): Promise<void> {
	const key = loadKey();
	userIds = [userIds].flat();
	if (!key || !userIds.length) return;

	const payload = encodeUTF8(JSON.stringify(notification));
	if (payload.length > recordSize - overhead) {
		io.warn(`Push notification is too large (${payload.length} bytes): ${notification.title}`);
		return;
	}

	try {
		const subscriptions = await database
			.selectFrom('push_subscriptions')
			.innerJoin('sessions', 'sessions.id', 'push_subscriptions.sessionId')
			.selectAll('push_subscriptions')
			.where('push_subscriptions.userId', 'in', userIds)
			.where('sessions.expires', '>', new Date())
			.execute();

		await Promise.all(
			subscriptions.map(subscription =>
				send(subscription, payload, key).catch(e =>
					io.warn('Push notification to', new URL(subscription.endpoint).host, 'failed:', io.errorText(e))
				)
			)
		);
	} catch (e) {
		io.warn('Could not send push notifications:', io.errorText(e));
	}
}
