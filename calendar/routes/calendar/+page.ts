import { getFullCalendars } from '@axium/calendar/client';
import { EventFilter, getSpanFilter } from '@axium/calendar/common';
import { getCurrentSession } from '@axium/client/user';
import type { Session, User } from '@axium/core';
import { redirect } from '@sveltejs/kit';
import { prettifyError } from 'zod';

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

	const calendars = await getFullCalendars(session.userId, filter);

	return { calendars, session, filter };
}
