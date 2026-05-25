import type { SyncDiff, SyncDiffObject, UserInternal } from '@axium/core';
import type { SelectQueryBuilder } from 'kysely';
import type { TargetName } from './acl.js';
import { userHasAccess, from as aclFrom } from './acl.js';
import { database } from './db/connection.js';
import type { Schema } from './db/index.js';

export interface GetEventsOptions {
	since?: bigint;
}

export type Op = 'c' | 'u' | 'd';

export interface Event<T> {
	index: bigint;
	id: string;
	type: TargetName;
	op: Op;
	object?: T;
}

export const objectParsers: Map<TargetName, (obj: any) => any> = new Map();

export const queryAdditions: Map<
	TargetName,
	(
		qb: SelectQueryBuilder<Schema, TargetName, any>,
		user: Pick<UserInternal, 'id' | 'roles' | 'tags'>
	) => SelectQueryBuilder<Schema, TargetName, any>
> = new Map();

export async function getEvents<T extends { id: string }>(
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>,
	options: GetEventsOptions = {}
): Promise<Event<T>[]> {
	const allEvents = await database
		.selectFrom('sync_events')
		.selectAll()
		.$narrowType<{ op: Op; type: TargetName }>()
		.$if(!!options.since, qb => qb.where('index', '>', options.since!))
		.execute();

	if (!allEvents.length) return [];

	const events = allEvents.filter(ev => ev.op == 'd');

	for (const [type, typeEvents] of Object.entries(
		Object.groupBy(
			allEvents.filter(e => e.op !== 'd'),
			ev => ev.type
		)
	) as [TargetName, Event<T>[]][]) {
		const nonDeletedIds = typeEvents.map(e => e.id);
		const objectsById = new Map<string, T>();

		const parser = objectParsers.get(type) || (obj => obj);

		const objects = await database
			.selectFrom(type)
			.selectAll()
			.select(aclFrom(type, { optional: true }))
			.where('id', 'in', nonDeletedIds)
			.where(userHasAccess(type, user, { optional: true }))
			.$if(queryAdditions.has(type), qb => queryAdditions.get(type)!(qb, user))
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
export function computeDiff(events: Event<any>[]): SyncDiff {
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

export async function getCurrentIndex(): Promise<bigint> {
	const last = await database.selectFrom('sync_events').select('index').orderBy('index', 'desc').limit(1).executeTakeFirst();
	return last?.index || 0n;
}

export const targets: Set<TargetName> = new Set();

export async function getInit<T extends { id: string }>(user: Pick<UserInternal, 'id' | 'roles' | 'tags'>): Promise<SyncDiffObject[]> {
	const objects: SyncDiffObject[] = [];

	for (const target of targets) {
		const parser = objectParsers.get(target) || (obj => obj);

		const items = await database
			.selectFrom(target)
			.selectAll()
			.select(aclFrom(target, { optional: true }))
			.where(userHasAccess(target, user, { optional: true }))
			.$if(queryAdditions.has(target), qb => queryAdditions.get(target)!(qb, user))
			.$castTo<T>()
			.execute();

		for (const obj of items) objects.push(Object.assign(parser(obj), { $type: target }));
	}

	return objects;
}
