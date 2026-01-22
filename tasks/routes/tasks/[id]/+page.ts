import { fetchAPI } from '@axium/client/requests';
import type { LoadEvent } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params }: LoadEvent) {
	const list = await fetchAPI('GET', 'task_lists/:id', {}, params.id!);

	return { list };
}
