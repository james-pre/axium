import { fetchAPI } from '@axium/client/requests';
import { getCurrentSession } from '@axium/client/user';
import type { Session } from '@axium/core';
import { parseList } from '@axium/tasks/client';
import type { LoadEvent } from '@sveltejs/kit';

export async function load({ parent }: LoadEvent) {
	let { session }: { session?: Session } = await parent();

	session ||= await getCurrentSession();

	const lists = await fetchAPI('GET', 'users/:id/task_lists', {}, session.userId);

	for (const list of lists) parseList(list);

	return { lists };
}
