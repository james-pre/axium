import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import type { LayoutRouteId } from './$types';

export const ssr = false;

export async function load({ url, route, parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	const tabs = [
		{ name: 'files', href: '/files', icon: 'folders', active: route.id.endsWith('/files/[id]') || route.id.endsWith('/files') },
		{ name: 'trash', href: '/files/trash', icon: 'trash', active: route.id.endsWith('/files/trash') },
		{ name: 'shared', href: '/files/shared', icon: 'user-group', active: route.id.endsWith('/files/shared') },
	] satisfies { name: string; href: LayoutRouteId; icon: string; active: boolean }[];

	return { session, tabs };
}
