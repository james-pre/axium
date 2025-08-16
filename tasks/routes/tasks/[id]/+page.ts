import { fetchAPI } from '@axium/client/requests';
import type { LoadEvent } from '@sveltejs/kit';
import { parseList } from '@axium/tasks/client';

export async function load({ params }: LoadEvent) {
	const list = await fetchAPI('GET', 'task_lists/:id', {}, params.id!);

	parseList(list);

	return { list };
}
