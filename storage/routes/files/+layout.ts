import { getCurrentSession } from '@axium/client/user';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoadEvent, LayoutRouteId } from './$types';

export const ssr = false;

export async function load({ url, route }: LayoutLoadEvent) {
	const session = await getCurrentSession().catch(() => null);

	if (!session) redirect(307, '/login?after=' + url.pathname);

	const tabs = [
		{ name: 'files', href: '/files', icon: 'folders', active: route.id.endsWith('/files/[id]') || route.id.endsWith('/files') },
		{ name: 'trash', href: '/files/trash', icon: 'trash', active: route.id.endsWith('/files/trash') },
		{ name: 'shared', href: '/files/shared', icon: 'user-group', active: route.id.endsWith('/files/shared') },
	] satisfies { name: string; href: LayoutRouteId; icon: string; active: boolean }[];

	return { session, tabs };
}
