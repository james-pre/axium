import { getUserStorageRoot } from '@axium/storage/client';
import type { LoadEvent } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }: LoadEvent) {
	const { session } = await parent();

	return {
		items: await getUserStorageRoot(session.userId),
	};
}
