import { text } from '@axium/client';
import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';

export const ssr = false;

export async function load({ route, parent }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	session ||= await getCurrentSession().catch(() => null);

	const id = route.id || '';

	const tabs = [
		{ name: text('kino.tab.home'), href: '/kino', icon: 'house', active: id.endsWith('/kino') },
		{ name: text('kino.tab.movies'), href: '/movies', icon: 'film', active: id.includes('/movies') },
		{ name: text('kino.tab.tv'), href: '/tv', icon: 'tv', active: id.includes('/tv') },
	];

	return { session, tabs };
}
