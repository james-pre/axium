import { SyncOptions, type AsyncResult, type SyncDiff, type UserInternal } from '@axium/core';
import type { TargetName } from '../acl.js';
import { userHasAccess } from '../acl.js';
import { database } from '../db/connection.js';
import { addRoute } from '../routes.js';
import { requireSession } from '../auth.js';
import { parseSearch } from '../requests.js';
import { count } from '../db/index.js';

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

addRoute({
	path: '/api/sync',
	async GET(req): AsyncResult<'GET', 'sync'> {
		const options = parseSearch(req, SyncOptions);

		const session = await requireSession(req);

		const events = await getSyncEvents(session.user, options);

		if (!events.length) {
			const index = BigInt((await count('sync_events')).sync_events);
			return { deleted: [], created: [], updated: [], index };
		}

		const grouped = Object.groupBy(events, ev => ev.op);

		return {
			deleted: grouped.d?.map(ev => ev.id) || [],
			created: grouped.c?.map(ev => ({ ...ev.object!, $type: ev.type })) || [],
			updated: grouped.u?.map(ev => ({ ...ev.object!, $type: ev.type })) || [],
			index: events.at(-1)!.index,
		} satisfies SyncDiff;
	},
});
