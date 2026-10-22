import { text } from '@axium/client';
import { connect } from '@axium/client/socket';
import { schemas } from '@axium/client/sync';
import { currentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import { StorageItemMetadata } from '@axium/storage/common';
import type { LayoutRouteId } from './$types';

schemas.set('storage', StorageItemMetadata);

export const ssr = false;

export async function load({ url, route, parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await currentSession();

	if (session) await connect().catch(() => null);

	const tabs = [
		{
			name: text('page.files.tab.files'),
			href: '/files',
			icon: 'folders',
			active: route.id.endsWith('/files/[id]') || route.id.endsWith('/files'),
		},
		{ name: text('page.files.tab.trash'), href: '/files/trash', icon: 'trash', active: route.id.endsWith('/files/trash') },
		{ name: text('page.files.tab.shared'), href: '/files/shared', icon: 'user-group', active: route.id.endsWith('/files/shared') },
		{ name: text('page.files.tab.synced'), href: '/files/synced', icon: 'arrows-rotate', active: route.id.endsWith('/files/synced') },
		{
			name: text('page.files.tab.settings'),
			href: '/files/settings',
			icon: 'gear-complex',
			active: route.id.endsWith('/files/settings'),
		},
		{ href: '/files/usage', icon: 'chart-pie-simple', active: route.id.endsWith('/files/usage'), mobile: true },
	] satisfies (
		| { name: string; href: LayoutRouteId; icon: string; active: boolean }
		| { href: LayoutRouteId; icon: string; active: boolean; mobile: true }
	)[];

	return { session, tabs };
}
