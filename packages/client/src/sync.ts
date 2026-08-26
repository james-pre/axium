import type { SyncDiff, SyncDiffObject } from '@axium/core';
import * as io from 'ioium';
import type { ZodObject, ZodUUID } from 'zod';
import { addListener } from './socket.js';

/** Schemas used to parse synced objects, by object type */
export const schemas = new Map<string, ZodObject<{ id: ZodUUID }>>();

/** Parse a synced object using the schema for its type. Objects without a schema are passed through. */
export function parseObject<T extends SyncDiffObject>(object: SyncDiffObject): T {
	const schema = schemas.get(object.$type);
	if (!schema) return object as T;
	return Object.assign(schema.parse(object), { $type: object.$type }) as T;
}

/**
 * Apply a diff to some synced objects, returning the updated objects.
 * Existing objects are updated in place, so bound references stay valid.
 * @param type If set, only objects of this type are created or updated.
 */
export function applyDiff<T extends { id: string; $type?: string }>(objects: readonly T[], diff: SyncDiff, type?: string): T[] {
	const deleted = new Set(diff.deleted);

	const updated = objects.filter(object => !deleted.has(object.id));

	const existing = new Map(updated.map(object => [object.id, object]));

	for (const incoming of [...diff.created, ...diff.updated]) {
		if (type && incoming.$type != type) continue;

		let object: T;
		try {
			object = parseObject<T & SyncDiffObject>(incoming);
		} catch (e) {
			io.warn(`Ignoring invalid ${incoming.$type} object from sync: ${io.errorText(e)}`);
			continue;
		}

		const current = existing.get(incoming.id);

		if (!current) {
			updated.push(object);
			existing.set(object.id, object);
			continue;
		}

		if (current.$type && current.$type != incoming.$type) {
			io.warn(`Type mismatch for synced object ${incoming.id}: currently ${current.$type}, incoming ${incoming.$type}`);
			continue;
		}

		Object.assign(current, object);
	}

	return updated;
}

const listeners = new Set<(diff: SyncDiff) => void>();

/**
 * Handle changes to synced objects pushed by the server.
 * The socket must be connected for these to be received.
 * @returns a function that removes the listener
 */
export function onSync(listener: (diff: SyncDiff) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

addListener('sync', diff => {
	io.debug(`sync: ${diff.created.length} created, ${diff.updated.length} updated, ${diff.deleted.length} deleted`);

	for (const listener of listeners) {
		try {
			listener(diff);
		} catch (e) {
			io.error('Sync listener failed: ' + io.errorText(e));
		}
	}
});
