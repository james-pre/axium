import type { StorageItemMetadata } from '@axium/storage/common';
import { getDirectoryMetadata } from '@axium/storage/client';
import { SvelteSet } from 'svelte/reactivity';

export const selection = $state(new SvelteSet());

export const items = $state<StorageItemMetadata[]>([]);

let lastSelected = $state<string>();

export function getLastSelected() {
	return lastSelected;
}

/** @todo move this into user preferences somehow */
export let debug = false;

export async function getDirectory(id: string, assignTo?: StorageItemMetadata[]) {
	const data = await getDirectoryMetadata(id);
	items.push(...data);
	assignTo = data;
	return data;
}

export function toggle(id: string): boolean {
	const has = selection.has(id);
	if (has) selection.delete(id);
	else {
		selection.add(id);
		lastSelected = id;
	}
	return has;
}

export function toggleRange(id: string) {
	const from = items.findIndex(item => item.id === lastSelected);
	const until = items.findIndex(item => item.id === id);
	if (from === -1 || until === -1) return;

	const range = items.slice(Math.min(from, until), Math.max(from, until) + 1);
	for (const item of range) toggle(item.id);
}
