import type { SyncDiff, SyncDiffObject } from '@axium/core';
import { hasActiveInput } from '@axium/client/web/utils';
import { applyDiff, onSync, type ApplyDiffOptions } from '@axium/client/sync';

/**
 * Keep a list of objects up to date with changes from the server.
 * Pass a function to get the list if it can be replaced.
 */
export function syncObjects<T extends { id: string }>(objects: T[] | (() => T[]), options: ApplyDiffOptions<T> = {}) {
	let deferred: SyncDiffObject[] = [];

	function applySync(diff: SyncDiff): void {
		const updated = [...deferred, ...diff.updated];
		const typing = hasActiveInput();

		deferred = typing ? updated : [];

		applyDiff(typeof objects == 'function' ? objects() : objects, { ...diff, updated: typing ? [] : updated }, options);
	}

	$effect(() => onSync(applySync));

	return function onfocusout() {
		// Focus moves after this event, so wait for it to settle before checking whether the user is still typing
		setTimeout(() => {
			if (deferred.length && !hasActiveInput()) applySync({ created: [], updated: [], deleted: [], index: 0n });
		});
	};
}

export function syncObject<T extends { id: string }>(object: T, onDelete?: () => void, type?: string) {
	let deferred: SyncDiffObject[] = [];

	function applySync(diff: SyncDiff): void {
		if (diff.deleted.includes(object.id)) {
			onDelete?.();
			return;
		}

		const updated = [...deferred, ...diff.updated];
		const typing = hasActiveInput();

		deferred = typing ? updated : [];

		applyDiff([object], { ...diff, created: [], updated: typing ? [] : updated }, { type });
	}

	$effect(() => onSync(applySync));
}
