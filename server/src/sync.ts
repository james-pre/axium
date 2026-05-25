import type { SyncDiff, SyncDiffObject, UserInternal } from '@axium/core';
import { warnOnce } from 'ioium';
import type { ReferenceExpression, SelectQueryBuilder } from 'kysely';
import type { WithRequired } from 'utilium';
import type { TargetName } from './acl.js';
import { from as aclFrom, existsIn } from './acl.js';
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

const targets: Map<keyof Schema, WithRequired<ObjectTypeConfig<any>, 'parse'>> = new Map();

export interface ObjectTypeConfig<K extends keyof Schema> {
	parse?(this: void, obj: any): any;
	queryAdditions?(
		this: void,
		qb: SelectQueryBuilder<Schema, K, any>,
		user: Pick<UserInternal, 'id' | 'roles' | 'tags'>
	): SelectQueryBuilder<Schema, K, any>;
	userId?: ReferenceExpression<Schema, K>;
}

export function addObjectType<K extends keyof Schema>(type: K, config: ObjectTypeConfig<K> = {}): void {
	targets.set(type, {
		parse: obj => obj,
		...config,
	});
}

function selectObject<K extends keyof Schema>(type: K, user: Pick<UserInternal, 'id' | 'roles' | 'tags'>, cfg: ObjectTypeConfig<K>) {
	return database
		.selectFrom(type as TargetName)
		.selectAll()
		.$if(!!cfg.queryAdditions, qb => cfg.queryAdditions!(qb as any, user))
		.select(aclFrom(type as TargetName, { optional: true }))
		.where(eb =>
			eb.or([
				eb((cfg.userId as ReferenceExpression<Schema, TargetName>) || 'userId', '=', user.id),
				existsIn(type as TargetName, user, { optional: true })(eb),
			])
		);
}

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
		const cfg = targets.get(type) || (warnOnce('Missing sync config for', type), { parse: obj => obj });

		const nonDeletedIds = typeEvents.map(e => e.id);
		const objectsById = new Map<string, T>();

		const objects = await selectObject(type, user, cfg).where('id', 'in', nonDeletedIds).$castTo<T>().execute();

		for (const obj of objects) objectsById.set(obj.id, obj);

		for (const ev of typeEvents) {
			const obj = objectsById.get(ev.id);
			if (obj) {
				ev.object = cfg.parse(obj);
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

export async function getInit<T extends { id: string }>(user: Pick<UserInternal, 'id' | 'roles' | 'tags'>): Promise<SyncDiffObject[]> {
	const objects: SyncDiffObject[] = [];

	for (const [target, cfg] of targets) {
		const items = await selectObject(target, user, cfg).$castTo<T>().execute();

		for (const obj of items) objects.push(Object.assign(cfg.parse(obj), { $type: target }));
	}

	return objects;
}
