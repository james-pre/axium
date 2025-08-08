import type { LoadEvent } from '@sveltejs/kit';
import { itemsSharedWith } from '@axium/storage/client';

export const ssr = false;

export async function load({ parent }: LoadEvent) {
	const { session } = await parent();

	return {
		items: await itemsSharedWith(session.userId),
	};
}
