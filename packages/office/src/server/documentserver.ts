import { getConfig, type User } from '@axium/core';
import feature from '@axium/core/features';
import serverConfig from '@axium/server/config';
import { error, json, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { StorageItemMetadata } from '@axium/storage/common';
import { streamRead } from '@axium/storage/node';
import { getLimits } from '@axium/storage/server/config';
import { get, getUserStats } from '@axium/storage/server/db';
import { finishItemUpdate } from '@axium/storage/server/item';
import * as io from 'ioium';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import type { Editor, EditorOptions, Format, Kind } from '../common.js';
import * as jwt from './jwt.js';

const documentTypes = {
	document: 'word',
	spreadsheet: 'cell',
	presentation: 'slide',
} satisfies Record<Kind, string>;

/** Where browsers reach the document server, which defaults to port 8443 on the host of Axium's origin */
function serverURL(): URL {
	const { server_url } = getConfig('@axium/office');
	if (server_url) return new URL(server_url);

	const { protocol, hostname } = new URL(serverConfig.origin);
	return new URL(`${protocol}//${hostname}:8443`);
}

/** Where the document server reaches Axium */
function internalURL(): string {
	return getConfig('@axium/office').internal_url ?? serverConfig.origin;
}

function secret(): string {
	const { secret } = getConfig('@axium/office');
	if (!secret) error(503, 'Office is not configured: set the document server secret');
	return secret;
}

/** The document server signs its requests to Axium into the `Authorization` header, or the body if it is configured to */
function verifySignature(request: Request, body?: { token?: unknown } | null): unknown {
	const header = request.headers.get('Authorization')?.replace(/^Bearer /i, '');
	const token = typeof body?.token == 'string' ? body.token : header;
	const claims = token && jwt.verify<{ payload?: unknown }>(token, secret());
	if (!claims) error(401, 'Invalid document server token');
	return claims.payload ?? claims;
}

/** Route parameters are only parsed for API routes, so other routes check the ID themselves */
function itemIdFrom({ id }: { id: string }): string {
	const result = z.uuid().safeParse(id);
	if (!result.success) error(400, 'Invalid item ID');
	return result.data;
}

/** An item the document server may open: it exists, is not trashed, and is not a directory */
export async function getItem(itemId: string): Promise<StorageItemMetadata> {
	const item = await get(itemId).catch(withError('Could not find the item'));
	if (item.trashedAt) error(410, 'Trashed items can not be opened');
	if (item.type == 'inode/directory') error(409, 'Directories do not have content');
	return item;
}

interface Session {
	key: string;
	/** The content hash after the session's last force save */
	hash?: string | null;
}

/**
 * Co-editing sessions that have force-saved, by item ID.
 * A force save changes the item but not the session, so new editors must still get the session's key.
 * This is held in memory, so a restart during such a session gives new editors a separate session.
 */
const sessions = new Map<string, Session>();

/** Unique per item version, and at most 128 characters of `[0-9a-zA-Z.=_-]` */
function versionKey(item: StorageItemMetadata): string {
	const version = createHash('sha256').update(`${item.hash}:${item.modifiedAt.getTime()}`).digest('hex');
	return `${item.id}-${version.slice(0, 32)}`;
}

function documentKey(item: StorageItemMetadata): string {
	const session = sessions.get(item.id);
	return session && session.hash == item.hash ? session.key : versionKey(item);
}

export interface EditorRequest {
	item: StorageItemMetadata;
	format: Format;
	user: User;
	canWrite: boolean;
	options: EditorOptions;
}

/** Everything the browser needs to open `item` in the document server's editor */
export function editorFor({ item, format, user, canWrite, options }: EditorRequest): Editor {
	const theme = feature('themes') ? user.preferences.theme : 'default';

	const config = {
		type: options.mobile ? 'mobile' : 'desktop',
		documentType: documentTypes[format.kind],
		document: {
			fileType: format.extension,
			key: documentKey(item),
			title: item.name,
			url: new URL(`/raw/office/${item.id}/content`, internalURL()).href,
			permissions: { edit: canWrite },
		},
		editorConfig: {
			mode: canWrite ? 'edit' : 'view',
			callbackUrl: new URL(`/raw/office/${item.id}/callback`, internalURL()).href,
			user: { id: user.id, name: user.name },
			customization: {
				compactHeader: true,
				toolbarHideFileName: true,
				forcesave: true,
				uiTheme: `theme-axium-${theme}`,
				logo: { visible: false },
				layout: { header: { user: false } },
				feedback: false,
				suggestFeature: false,
			},
		},
	};

	return { url: serverURL().href, config: { ...config, token: jwt.sign(config, secret()) } };
}

const ContentRequest = z.looseObject({ url: z.url() });

addRoute({
	path: '/raw/office/:id/content',
	params: { id: z.uuid() },
	async GET(request, params) {
		const itemId = itemIdFrom(params);
		const signed = ContentRequest.safeParse(verifySignature(request));
		if (!signed.success || new URL(signed.data.url).pathname != new URL(request.url).pathname)
			error(403, 'This token is for another document');

		const item = await getItem(itemId);
		if (!item.size) return null;
		return new Response(streamRead(join(getConfig('@axium/storage').data, item.id)), {
			headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(item.size) },
		});
	},
});

/** The document server only offers saved documents from itself, so this refuses to download from anywhere else */
async function save(itemId: string, location: string): Promise<StorageItemMetadata> {
	const url = new URL(location);
	const server = serverURL();
	url.protocol = server.protocol;
	url.host = server.host;

	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url.origin} responded with ${response.status}`);
	const content = await response.bytes();

	const item = await getItem(itemId);
	if (item.immutable) error(405, 'Item is immutable');

	const size = BigInt(content.byteLength);
	const [usage, limits] = await Promise.all([getUserStats(item.userId), getLimits(item.userId)]).catch(
		withError('Could not fetch usage and/or limits')
	);

	if (limits.user_size && (usage.usedBytes + size - item.size) / 1_000_000n >= limits.user_size) error(413, 'Not enough space');
	if (limits.item_size && content.byteLength > limits.item_size * 1_000_000) error(413, 'File size exceeds maximum size');

	const hash = createHash('BLAKE2b512').update(content).digest();
	return await finishItemUpdate(itemId, size, hash, path => writeFileSync(path, content));
}

function endSession(itemId: string, key: string): void {
	if (sessions.get(itemId)?.key == key) sessions.delete(itemId);
}

const Callback = z.looseObject({
	key: z.string(),
	status: z.int(),
	url: z.url().optional(),
});
interface Callback extends z.infer<typeof Callback> {}

const enum Status {
	ReadyForSaving = 2,
	SaveFailed = 3,
	ClosedUnchanged = 4,
	ForceSaved = 6,
	ForceSaveFailed = 7,
}

async function handleCallback(itemId: string, callback: Callback): Promise<void> {
	switch (callback.status) {
		case Status.ReadyForSaving:
			if (!callback.url) error(400, 'Missing document URL');
			await save(itemId, callback.url);
			endSession(itemId, callback.key);
			return;
		case Status.ForceSaved: {
			if (!callback.url) error(400, 'Missing document URL');
			const saved = await save(itemId, callback.url);
			sessions.set(itemId, { key: callback.key, hash: saved.hash });
			return;
		}
		case Status.ClosedUnchanged:
			endSession(itemId, callback.key);
			return;
		case Status.SaveFailed:
		case Status.ForceSaveFailed:
			io.warn(`The document server could not save ${itemId} (status ${callback.status})`);
			return;
	}
}

addRoute({
	path: '/raw/office/:id/callback',
	params: { id: z.uuid() },
	async POST(request, params) {
		const itemId = itemIdFrom(params);
		const body = await request.json().catch(() => error(400, 'Invalid JSON in request body'));
		const parsed = Callback.safeParse(verifySignature(request, body));
		if (!parsed.success) error(400, 'Invalid callback');
		const callback = parsed.data;
		if (!callback.key.startsWith(itemId + '-')) error(403, 'This callback is for another document');

		try {
			await handleCallback(itemId, callback);
			return json({ error: 0 });
		} catch (e) {
			io.error(`Document server callback for ${itemId} failed: ${io.errorText(e)}`);
			return json({ error: 1 });
		}
	},
});
