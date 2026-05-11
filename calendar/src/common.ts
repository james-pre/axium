import { $API, AccessControl, pickPermissions, type UserInternal } from '@axium/core';
import type { WithRequired } from 'utilium';
import * as z from 'zod';
import $pkg from '../package.json' with { type: 'json' };
import { Color } from '@axium/core/color';

export function withOrdinalSuffix(val: number): string {
	const tens = val % 10,
		hundreds = val % 100;

	if (tens == 1 && hundreds != 11) return val + 'st';
	if (tens == 2 && hundreds != 12) return val + 'nd';
	if (tens == 3 && hundreds != 13) return val + 'rd';
	return val + 'th';
}

export function toRRuleDate(date: Temporal.ZonedDateTime): Date {
	return new Date(Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute));
}

export function fromRRuleDate(d: Date): Temporal.ZonedDateTime {
	const fromUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
	return Temporal.ZonedDateTime.from(fromUTC.toJSON());
}

export function weekDaysFor(date: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
	const days: Temporal.ZonedDateTime[] = [];
	for (let i = 1; i <= date.daysInWeek; i++) {
		days.push(date.with({ day: date.day - date.dayOfWeek + i }));
	}
	return days;
}

export function longWeekDay(date: Temporal.ZonedDateTime): string {
	return date.toLocaleString('default', { weekday: 'long' });
}

export function weekDayOfMonth(date: Temporal.ZonedDateTime): string {
	const weekOfMonth = Math.ceil(date.day / date.daysInWeek);
	return `${withOrdinalSuffix(weekOfMonth)} ${longWeekDay(date)}`;
}

/**
 * Converts a date to the format expected by `<input type="datetime-local">`
 */
export function dateToInputValue(date?: Temporal.ZonedDateTime): string | null {
	if (!date) return null;
	return date.withTimeZone('UTC').toPlainDateTime().round('second').toJSON();
}

/**
 * @todo this feels like a mess:
 * - Want to support "external" attendees where no associated user exists (no userId), email makes sense for the "key"
 * - For users, we want to use the userId as the "key"
 * - Need to check for uniqueness server-side
 */
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
	start: z.instant(),
	end: z.instant(),
});
export interface EventFilter extends z.infer<typeof EventFilter> {}

export function getSpanFilter(span: 'week' | 'month', at: Temporal.ZonedDateTime = Temporal.Now.zonedDateTimeISO()): EventFilter {
	switch (span) {
		case 'week': {
			const startDay = at.day - at.dayOfWeek;
			return {
				start: at.with({ day: startDay }).toInstant(),
				end: at.with({ day: startDay + at.daysInWeek }).toInstant(),
			};
		}
		case 'month':
			return {
				start: at.with({ day: 1 }).toInstant(),
				end: at.with({ day: at.daysInMonth }).toInstant(),
			};
	}
}

export const EventData = z.object({
	calId: z.uuid(),
	summary: z.string().max(250),
	location: z.string().max(250).nullish(),
	start: z.zonedDateTime(),
	end: z.zonedDateTime(),
	isAllDay: z.coerce.boolean(),
	description: z.string().max(2000).nullish(),
	color: Color.nullish(),
	// note: recurrences are not support yet
	recurrence: z.string().max(1000).nullish(),
	recurrenceExcludes: z.string().max(100).array().max(100).nullish(),
	recurrenceId: z.uuid().nullish(),
});
export interface EventData extends z.infer<typeof EventData> {}

export const EventInit = EventData.extend({
	attendees: AttendeeInit.array().max(100),
	sendEmails: z.boolean(),
	/** Whether to update all recurring events (true) or just subsequent ones (false). Only valid when changing a recurring event. */
	recurrenceUpdateAll: z.boolean().optional(),
});
export interface EventInit extends z.infer<typeof EventInit> {}

export const Event = EventData.extend({
	id: z.uuid(),
	created: z.coerce.date(),
	attendees: Attendee.array(),
});
export interface Event extends z.infer<typeof Event> {
	calendar?: Calendar;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: '2-digit',
	minute: '2-digit',
});

export function formatEventTimes(event: Event): string {
	return timeFormatter.formatRange(event.start.epochMilliseconds, event.end.epochMilliseconds);
}

export const CalendarInit = z.object({
	name: z.string(),
	color: Color.nullish(),
});
export interface CalendarInit extends z.infer<typeof CalendarInit> {}

export const Calendar = CalendarInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	created: z.coerce.date(),
	acl: AccessControl.array().optional(),
});
export interface Calendar extends z.infer<typeof Calendar> {}

export interface CalendarPermissionsInfo {
	icon: string;
	list: string;
	perms: Record<string, boolean>;
}

export function getCalPermissionsInfo(
	cal: WithRequired<Calendar, 'acl'>,
	user: Pick<UserInternal, 'id' | 'roles' | 'tags'>
): CalendarPermissionsInfo {
	const ac = cal.acl.find(
		ac =>
			ac.userId == user.id ||
			(ac.role && user.roles.includes(ac.role)) ||
			(ac.tag && user.tags.includes(ac.tag)) ||
			(!ac.userId && !ac.role && !ac.tag)
	);

	if (!ac) throw new Error('No ACL entry available to show permissions');

	const perms = pickPermissions(ac);

	return {
		list: Object.entries(perms)
			.filter(([, v]) => v)
			.map(([k]) => k)
			.join(', '),
		icon: ac.manage ? 'user-gear' : ac.edit ? 'user-pen' : ac.read ? 'user' : 'user-lock',
		perms,
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

/**
 * Convert a `Date` to an iCalendar datetime
 */
export function toDateTime(date: Temporal.ZonedDateTime): string {
	const base = date
		.round('second')
		.withTimeZone('UTC')
		.toPlainDateTime()
		.round('second')
		.toJSON()
		.replaceAll('-', '')
		.replaceAll(':', '');
	return base + 'Z';
}

/** e.g. `FR`, `SA` */
export function toByDay(date: Temporal.ZonedDateTime): string {
	return date.toLocaleString('en', { weekday: 'short' }).slice(0, 2).toUpperCase();
}

export function eventToICS(event: Event): string {
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:-//Axium//Calendar ${$pkg.version}//EN`,
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		'UID:' + event.id,
		'DTSTAMP:' + toDateTime(Temporal.Now.zonedDateTimeISO()),
		'DTSTART:' + toDateTime(event.start),
		'DTEND:' + toDateTime(event.end),
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
