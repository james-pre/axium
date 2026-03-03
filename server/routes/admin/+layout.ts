import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import type { LayoutLoadEvent, LayoutRouteId } from './$types';
import { text } from '@axium/client';

export const ssr = false;

export async function load({
	parent,
	route,
}: Omit<LayoutLoadEvent, 'parent'> & { parent?(): Promise<{ session?: Session & { user: User } }> }) {
	let { session } = (await parent?.()) ?? { session: null };

	const tabs = [
		{ name: 'dashboard', href: '/admin', icon: 'gauge', active: route.id.endsWith('/admin') },
		{
			name: text('page.admin.tab.users'),
			href: '/admin/users',
			icon: 'user-group',
			active: route.id.endsWith('/admin/users') || route.id.endsWith('/admin/users/[id]'),
		},
		{ name: text('page.admin.tab.config'), href: '/admin/config', icon: 'sliders', active: route.id.endsWith('/admin/config') },
		{
			name: text('page.admin.tab.plugins'),
			href: '/admin/plugins',
			icon: 'puzzle-piece-simple',
			active: route.id.endsWith('/admin/plugins'),
		},
		{ name: text('page.admin.tab.audit'), href: '/admin/audit', icon: 'file-shield', active: route.id.endsWith('/admin/audit') },
	] satisfies { name: string; href: LayoutRouteId; icon: string; active: boolean }[];

	session ||= await getCurrentSession().catch(() => null);

	if (!session) location.href = '/login?after=' + encodeURIComponent(location.pathname + location.search);

	return { session, tabs };
}
