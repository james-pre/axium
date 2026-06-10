import { EventFilter, getSpanFilter, type Calendar } from '@axium/calendar/common';
import { fetchAPI } from '@axium/client/requests';
import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import { redirect } from '@sveltejs/kit';
import { prettifyError } from 'zod';
import type { WithRequired } from 'utilium';

export const ssr = false;

export async function load({ parent, url }) {
	let { session }: { session?: (Session & { user: User }) | null } = await parent();

	try {
		session ||= await getCurrentSession();
	} catch (e) {
		redirect(307, '/login?after=/calendar');
	}

	const filter: EventFilter = getSpanFilter('week', new Date());
	try {
		const parsed = EventFilter.partial().parse(Object.fromEntries(url.searchParams));
		Object.assign(filter, parsed);
	} catch (e: any) {
		throw prettifyError(e);
	}

	const calendars: WithRequired<Calendar, 'acl'>[] = await fetchAPI('GET', 'users/:id/calendars', {}, session.userId);

	return { calendars, session, filter };
}
