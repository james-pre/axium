import * as io from 'ioium/node';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import config from '../config.js';
import type { Schema } from './index.js';

export type Database = Kysely<Schema> & AsyncDisposable;

const sym = Symbol.for('Axium:database');

// eslint-disable-next-line no-shadow-restricted-names
declare const globalThis: {
	[sym]?: Database;
};

export let database: Database;

export function connect(): Database {
	if (database) return database;
	if (globalThis[sym]) return (database = globalThis[sym]);

	database = new Kysely<Schema>({
		dialect: new PostgresDialect({ pool: new pg.Pool(config.db) }),
		log(event) {
			if (event.level != 'error') return;
			io.error('Query failed:', event.query.sql);
		},
	});

	const dispose = database[Symbol.asyncDispose].bind(database);

	Object.assign(database, {
		async [Symbol.asyncDispose]() {
			notificationHandlers.clear();
			const client = notifications;
			notifications = null;
			client?.removeAllListeners();
			await client?.end().catch(() => {});
			await dispose();
			// @ts-expect-error 2322
			database = null;
			// @ts-expect-error 2322
			globalThis[sym] = null;
		},
	});

	globalThis[sym] = database;
	io.debug('Connected to database!');
	return database;
}

/**
 * Handlers for Postgres notifications, by channel.
 * Notifications need a dedicated connection, since pooled ones are handed out to other queries.
 */
const notificationHandlers = new Map<string, Set<(payload: string) => void>>();

let notifications: pg.Client | null = null;

async function connectNotifications(): Promise<pg.Client> {
	if (notifications) return notifications;

	const client = new pg.Client(config.db);

	client.on('notification', ({ channel, payload }) => {
		for (const handler of notificationHandlers.get(channel) || []) {
			try {
				handler(payload || '');
			} catch (e: any) {
				io.error(`DB notification handler for '${channel}' failed: ` + io.errorText(e));
			}
		}
	});

	client.on('error', (e: Error) => {
		io.warn('DB notification connection failed: ' + e.message);
		reconnectNotifications();
	});

	await client.connect();

	notifications = client;
	return client;
}

/** How long to wait before trying to reconnect the notification client */
const reconnectDelay = 5000;

function reconnectNotifications(): void {
	if (!notifications) return;

	notifications.removeAllListeners();
	void notifications.end().catch(() => {});
	notifications = null;

	setTimeout(() => {
		if (!notificationHandlers.size) return;

		void connectNotifications()
			.then(async client => {
				for (const channel of notificationHandlers.keys()) await client.query(`LISTEN "${channel}"`);
				io.debug('DB reconnected notification client');
			})
			.catch(() => reconnectNotifications());
	}, reconnectDelay).unref();
}

/**
 * Listen for Postgres notifications on a channel, e.g. ones sent using `pg_notify`.
 * All listeners share a single connection, which is reconnected if it is lost.
 */
export async function listen(channel: string, handler: (payload: string) => void): Promise<void> {
	const handlers = notificationHandlers.get(channel) || new Set();
	handlers.add(handler);
	notificationHandlers.set(channel, handlers);

	const client = await connectNotifications();
	await client.query(`LISTEN "${channel}"`);
	io.debug(`DB listening for '${channel}' notifications`);
}
