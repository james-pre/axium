import { getCurrentSession } from '@axium/client/user';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoadEvent } from './$types';

export const ssr = false;

export async function load({ url, route }: LayoutLoadEvent) {
	const session = await getCurrentSession().catch(() => null);

	if (!session) redirect(307, '/login?after=' + url.pathname);

	return {
		session: await getCurrentSession(),
		route,
	};
}
