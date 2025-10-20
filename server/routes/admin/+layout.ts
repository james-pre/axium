import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import type { LayoutLoadEvent, LayoutRouteId } from './$types';

export const ssr = false;

export async function load({
	parent,
	route,
}: Omit<LayoutLoadEvent, 'parent'> & { parent?(): Promise<{ session?: Session & { user: User } }> }) {
	let { session } = (await parent?.()) ?? { session: null };

	const tabs = [
		{ name: 'dashboard', href: '/admin', icon: 'gauge', active: route.id.endsWith('/admin') },
		{
			name: 'users',
			href: '/admin/users',
			icon: 'user-group',
			active: route.id.endsWith('/admin/users') || route.id.endsWith('/admin/users/[id]'),
		},
		{ name: 'configuration', href: '/admin/config', icon: 'sliders', active: route.id.endsWith('/admin/config') },
		{ name: 'plugins', href: '/admin/plugins', icon: 'puzzle-piece-simple', active: route.id.endsWith('/admin/plugins') },
		{ name: 'audit log', href: '/admin/audit', icon: 'file-shield', active: route.id.endsWith('/admin/audit') },
	] satisfies { name: string; href: LayoutRouteId; icon: string; active: boolean }[];

	session ||= await getCurrentSession().catch(() => null);

	return { session, tabs };
}
