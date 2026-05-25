import type { AsyncResult, SyncDiff, SyncDiffObject, UserInternal } from '@axium/core';
import { SyncOptions } from '@axium/core';
import type { TargetName } from '../acl.js';
import { userHasAccess } from '../acl.js';
import { requireSession } from '../auth.js';
import { database } from '../db/connection.js';
import { parseSearch } from '../requests.js';
import { addRoute } from '../routes.js';

export interface GetSyncEventsOptions {
	since?: bigint;
}

export type SyncOp = 'c' | 'u' | 'd';

export interface SyncEvent<T> {
	index: bigint;
	id: string;
	type: TargetName;
	op: SyncOp;
	object?: T;
}

export const syncEventObjectParsers = new Map<TargetName, (obj: any) => any>();

export async function getSyncEvents<T extends { id: string }>(
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: GetSyncEventsOptions = {}
): Promise<SyncEvent<T>[]> {
	const allEvents = await database
		.selectFrom('sync_events')
		.selectAll()
		.$narrowType<{ op: SyncOp; type: TargetName }>()
		.$if(!!options.since, qb => qb.where('index', '>', options.since!))
		.execute();

	if (!allEvents.length) return [];

	const events = allEvents.filter(ev => ev.op == 'd');

	for (const [type, typeEvents] of Object.entries(
		Object.groupBy(
			allEvents.filter(e => e.op !== 'd'),
			ev => ev.type
		)
	) as [TargetName, SyncEvent<T>[]][]) {
		const nonDeletedIds = typeEvents.map(e => e.id);
		const objectsById = new Map<string, T>();

		const parser = syncEventObjectParsers.get(type) || (obj => obj);

		const objects = await database
			.selectFrom(type)
			.selectAll()
			.where('id', 'in', nonDeletedIds)
			.where(userHasAccess(type, user))
			.$castTo<T>()
			.execute();

		for (const obj of objects) objectsById.set(obj.id, obj);

		for (const ev of typeEvents) {
			const obj = objectsById.get(ev.id);
			if (obj) {
				ev.object = parser(obj);
				events.push(ev);
			}
		}
	}

	events.sort((a, b) => Number(a.index - b.index));
	return events;
}

/**
 * Computes a sync diff from some events. This also collapses some changes:
 * - create followed by delete -> nothing
 * - updated followed by delete -> delete
 * - create followed by update -> create
 * - multiple updates -> just one
 */
export function computeSyncDiff(events: SyncEvent<any>[]): SyncDiff {
	if (!events.length) throw new Error('Can not compute diff without any events');

	const { index } = events.at(-1)!;

	const deleted: string[] = [],
		created: Record<string, SyncDiffObject> = Object.create(null),
		updated: Record<string, SyncDiffObject> = Object.create(null);

	for (const ev of events) {
		switch (ev.op) {
			case 'c':
				created[ev.id] = { ...ev.object!, $type: ev.type };
				break;
			case 'u':
				if (ev.id in created) break;
				updated[ev.id] = { ...ev.object!, $type: ev.type };
				break;
			case 'd':
				if (ev.id in created) {
					delete created[ev.id];
					break;
				}
				if (ev.id in updated) delete updated[ev.id];
				deleted.push(ev.id);
				break;
		}
	}

	return { deleted, created: Object.values(created), updated: Object.values(updated), index };
}

export async function getCurrentSyncIndex(): Promise<bigint> {
	const last = await database.selectFrom('sync_events').select('index').orderBy('index', 'desc').limit(1).executeTakeFirst();
	return last?.index || 0n;
}

addRoute({
	path: '/api/sync',
	async GET(req): AsyncResult<'GET', 'sync'> {
		const options = parseSearch(req, SyncOptions);

		const session = await requireSession(req);

		const events = await getSyncEvents(session.user, options);

		return events.length ? computeSyncDiff(events) : { deleted: [], created: [], updated: [], index: await getCurrentSyncIndex() };
	},
});
