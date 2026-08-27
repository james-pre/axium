import type { SyncDiff, SyncDiffObject } from '@axium/core';
import { hasActiveInput } from '@axium/client/web/utils';
import { applyDiff, onSync } from '@axium/client/sync';

export function syncObjects<T extends { id: string }>(objects: T[], type?: string) {
	let deferred: SyncDiffObject[] = [];

	function applySync(diff: SyncDiff): void {
		const updated = [...deferred, ...diff.updated];
		const typing = hasActiveInput();

		deferred = typing ? updated : [];

		applyDiff(objects, { ...diff, updated: typing ? [] : updated }, type);
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

		applyDiff([object], { ...diff, created: [], updated: typing ? [] : updated }, type);
	}

	$effect(() => onSync(applySync));
}
