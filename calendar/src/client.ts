import { fetchAPI } from '@axium/client/requests';
import type { Calendar, Event, EventFilter, EventData } from './common.js';
import type { WithRequired } from 'utilium';

export interface FullCalendar extends WithRequired<Calendar, 'acl'> {
	events?: Event[];
}

export async function getFullCalendars(userId: string, filter: EventFilter): Promise<FullCalendar[]> {
	const calendars: FullCalendar[] = await fetchAPI('GET', 'users/:id/calendars', {}, userId);

	for (const cal of calendars) {
		cal.events = await fetchAPI('GET', 'calendars/:id/events', filter, cal.id);
		for (const event of cal.events ?? []) event.calendar = cal;
	}

	return calendars;
}

export interface EventInitFormData extends Record<Exclude<keyof EventData, 'attendees' | 'recurrenceExcludes'>, string> {}
