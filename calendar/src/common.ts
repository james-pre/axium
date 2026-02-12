import { $API } from '@axium/core';
import * as z from 'zod';

export const AttendeeInit = z.object({
	email: z.email(),
	userId: z.uuid().optional(),
	name: z.string().optional(),
});
export interface AttendeeInit extends z.infer<typeof AttendeeInit> {}

export const AttendeeStatus = z.literal(['needs-action', 'accepted', 'declined', 'tentative']);
export type AttendeeStatus = z.infer<typeof AttendeeStatus>;

export const Attendee = AttendeeInit.extend({
	eventId: z.uuid(),
	status: AttendeeStatus,
	role: z.string().optional(),
});
export interface Attendee extends z.infer<typeof Attendee> {}

export const EventInit = z.object({
	calId: z.uuid(),
	summary: z.string(),
	location: z.string().optional(),
	start: z.coerce.date(),
	end: z.coerce.date(),
	description: z.string().optional(),
	attendees: AttendeeInit.array().optional().default([]),
	// note: recurrences are not support yet
	recurrence: z.string().optional(),
	recurrenceExcludes: z.array(z.string()).optional(),
	recurrenceId: z.uuid().optional(),
});
export interface EventInit extends z.infer<typeof EventInit> {}

export const Event = EventInit.extend({
	id: z.uuid(),
	created: z.coerce.date(),
	attendees: Attendee.array(),
});
export interface Event extends z.infer<typeof Event> {}

export const CalendarInit = z.object({
	name: z.string(),
});
export interface CalendarInit extends z.infer<typeof CalendarInit> {}

export const Calendar = CalendarInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	created: z.coerce.date(),
});
export interface Calendar extends z.infer<typeof Calendar> {}

const CalendarAPI = {
	'users/:id/calendars': {
		PUT: [CalendarInit, Calendar],
		GET: Calendar.array(),
	},
	'calendars/:id': {
		GET: Calendar,
		PATCH: [CalendarInit, Calendar],
		DELETE: Calendar,
	},
	'calendars/:id/events': {
		GET: Event.array(),
		PUT: [EventInit, Event],
	},
	'events/:id': {
		GET: Event,
		PATCH: [EventInit, Event],
		DELETE: Event,
	},
} as const;

type CalendarAPI = typeof CalendarAPI;

declare module '@axium/core/api' {
	export interface $API extends CalendarAPI {}
}

Object.assign($API, CalendarAPI);

export function eventToICS(event: Event): string {
	// @todo
}

export function eventFromICS(ics: string): Event {
	// @todo
}
