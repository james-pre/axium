import { $API, AccessControl, pickPermissions, type UserInternal } from '@axium/core';
import * as z from 'zod';
import $pkg from '../package.json' with { type: 'json' };
import type { WithRequired } from 'utilium';

export function dayOfYear(date: Date): number {
	const yearStart = new Date(date.getFullYear(), 0, 1);
	return Math.round((date.getTime() - yearStart.getTime()) / 86400000 + 1);
}

/**
 *
 * @param date
 * @param baseOnWeeks Whether to use day-based (w1 = 1-7, w2 = 8-14), or week-based (Sat-Sun)
 * @returns
 */
export function weekOfYear(date: Date, baseOnWeeks: boolean = false): number {
	let day = dayOfYear(date);
	if (baseOnWeeks) {
		day += new Date(date.getFullYear(), 0, 1).getDay();
	}
	const week = Math.ceil(day / 7);
	return week > 52 ? week % 52 : week;
}

export function weekDaysFor(date: Date): Date[] {
	const days = [];
	for (let i = 0; i < 7; i++) {
		days.push(new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay() + i, 0, 0, 0, 0));
	}
	return days;
}

export const AttendeeInit = z.object({
	email: z.email(),
	userId: z.uuid().nullish(),
	name: z.string().nullish(),
});
export interface AttendeeInit extends z.infer<typeof AttendeeInit> {}

export const AttendeeStatus = z.literal(['needs-action', 'accepted', 'declined', 'tentative']);
export type AttendeeStatus = z.infer<typeof AttendeeStatus>;

export const Attendee = AttendeeInit.extend({
	eventId: z.uuid(),
	status: AttendeeStatus,
	role: z.string().nullish(),
});
export interface Attendee extends z.infer<typeof Attendee> {}

export const EventFilter = z.object({
	start: z.coerce.date(),
	end: z.coerce.date(),
});
export interface EventFilter extends z.infer<typeof EventFilter> {}

export function getSpanFilter(span: 'week' | 'month', at: Date): EventFilter {
	switch (span) {
		case 'week': {
			const startDay = at.getDate() - at.getDay();
			return {
				start: new Date(at.getFullYear(), at.getMonth(), startDay),
				end: new Date(at.getFullYear(), at.getMonth(), startDay + 6),
			};
		}
		case 'month':
			return {
				start: new Date(at.getFullYear(), at.getMonth(), 1),
				end: new Date(at.getFullYear(), at.getMonth() + 1, 0),
			};
	}
}

export const EventInit = z.object({
	calId: z.uuid(),
	summary: z.string(),
	location: z.string().nullish(),
	start: z.coerce.date(),
	end: z.coerce.date(),
	description: z.string().nullish(),
	attendees: AttendeeInit.array().optional().default([]),
	// note: recurrences are not support yet
	recurrence: z.string().nullish(),
	recurrenceExcludes: z.array(z.string()).nullish(),
	recurrenceId: z.uuid().nullish(),
});
export interface EventInit extends z.infer<typeof EventInit> {}

export const Event = EventInit.extend({
	id: z.uuid(),
	created: z.coerce.date(),
	attendees: Attendee.array(),
});
export interface Event extends z.infer<typeof Event> {
	calendar?: Calendar;
}

export const CalendarInit = z.object({
	name: z.string(),
});
export interface CalendarInit extends z.infer<typeof CalendarInit> {}

export const Calendar = CalendarInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	created: z.coerce.date(),
	acl: AccessControl.array().optional(),
});
export interface Calendar extends z.infer<typeof Calendar> {}

export function getCalPermissionsInfo(
	cal: WithRequired<Calendar, 'acl'>,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>
): { icon: string; list: string } {
	const ac = cal.acl.find(
		ac =>
			ac.userId == user.id ||
			(ac.role && user.roles.includes(ac.role)) ||
			(ac.tag && user.tags.includes(ac.tag)) ||
			(!ac.userId && !ac.role && !ac.tag)
	);

	if (!ac) throw new Error('No ACL entry available to show permissions');

	return {
		list: Object.entries(pickPermissions(ac))
			.filter(([, v]) => v)
			.map(([k]) => k)
			.join(', '),
		icon: ac.manage ? 'user-gear' : ac.edit ? 'user-pen' : ac.read ? 'user' : 'user-lock',
	};
}

const CalendarAPI = {
	'users/:id/calendars': {
		PUT: [CalendarInit, Calendar],
		GET: Calendar.required({ acl: true }).array(),
	},
	'calendars/:id': {
		GET: Calendar.required({ acl: true }),
		PATCH: [CalendarInit, Calendar],
		DELETE: Calendar,
	},
	'calendars/:id/events': {
		GET: [EventFilter, Event.array()],
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

function formatDate(date: Date): string {
	return date.toUTCString().replaceAll('-', '').replaceAll(':', '');
}

export function eventToICS(event: Event): string {
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:-//Axium//Calendar ${$pkg.version}//EN`,
		'BEGIN:VEVENT',
		'UID:' + event.id,
		'DTSTAMP:' + formatDate(new Date()),
		'DTSTART:' + formatDate(event.start),
		'DTEND:' + formatDate(event.end),
		'SUMMARY:' + event.summary,
	];

	if (event.description) lines.push('DESCRIPTION:' + event.description);
	if (event.location) lines.push('LOCATION:' + event.location);

	if (event.attendees) {
		for (const attendee of event.attendees) {
			let line = 'ATTENDEE';
			if (attendee.status) line += ';PARTSTAT=' + attendee.status.toUpperCase();
			if (attendee.name) line += ';CN=' + attendee.name;
			if (attendee.role) line += ';ROLE=' + attendee.role;
			line += ':mailto:' + attendee.email;
			lines.push(line);
		}
	}

	if (event.recurrence) lines.push('RRULE:' + event.recurrence);

	lines.push('END:VEVENT');
	lines.push('END:VCALENDAR');

	return lines.join('\r\n');
}

export function eventFromICS(ics: string): Event {
	throw 'eventFromICS not implemented yet';
}
