import { fetchAPI } from '@axium/client/requests';
import type { AttendeeInit, Calendar, Event, EventData, EventFilter } from './common.js';

export async function getEvents(calendars: Calendar[], filter: EventFilter): Promise<Event[]> {
	const events: Event[] = [];

	for (const cal of calendars) {
		const calEvents: Event[] = await fetchAPI('GET', 'calendars/:id/events', filter, cal.id);
		for (const event of calEvents) {
			event.calendar = cal;
			events.push(event);
		}
	}

	return events;
}

export interface EventInitFormData extends Record<Exclude<keyof EventData, 'attendees' | 'recurrenceExcludes'>, string> {}

export interface EventInitProp extends EventData {
	attendees: AttendeeInit[];
	calendar?: Calendar;
}
