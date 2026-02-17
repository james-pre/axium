import type { AsyncResult } from '@axium/core/api';
import { from as aclFrom, userHasAccess } from '@axium/server/acl';
import { authRequestForItem, checkAuthForUser, requireSession } from '@axium/server/auth';
import { database, type Schema } from '@axium/server/database';
import { error, parseBody, parseSearch, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { sql, type AliasedRawBuilder, type ExpressionBuilder } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import type schema from '../db.json';
import type { AttendeeStatus, Calendar, Event } from './common.js';
import { Attendee, CalendarInit, EventFilter, EventInit } from './common.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

function withEncoded<T>(value: Omit<T, 'color'> & { color?: number | null }): T {
	return (
		value.color === undefined || value.color === null
			? value
			: Object.assign(value, { color: value.color.toString(16).padStart(8, '0') })
	) as T;
}

function withDecoded<T>(value: T & { color?: string | null }): Omit<T, 'color'> & { color?: number | null } {
	return (value.color === undefined || value.color === null ? value : Object.assign(value, { color: parseInt(value.color, 16) })) as any;
}

addRoute({
	path: '/api/users/:id/calendars',
	params: { id: z.uuid() },
	async GET(request: Request, { id: userId }): AsyncResult<'GET', 'users/:id/calendars'> {
		const { user } = await checkAuthForUser(request, userId);

		const result = await database
			.selectFrom('calendars')
			.selectAll()
			.select(aclFrom('calendars'))
			.where(userHasAccess('calendars', user))
			.execute()
			.catch(withError('Could not get calendars'));

		return result.map(c => withEncoded(c));
	},
	async PUT(request: Request, { id: userId }): AsyncResult<'PUT', 'users/:id/calendars'> {
		const init = await parseBody(request, CalendarInit);

		await checkAuthForUser(request, userId);

		return withEncoded(
			await database
				.insertInto('calendars')
				.values({ ...init, userId })
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not create calendar'))
		);
	},
});

addRoute({
	path: '/api/calendars/:id',
	params: { id: z.uuid() },
	async GET(request: Request, { id }): AsyncResult<'GET', 'calendars/:id'> {
		const { item } = await authRequestForItem(request, 'calendars', id, { read: true });
		return withEncoded(item);
	},
	async PATCH(request: Request, { id }): AsyncResult<'PATCH', 'calendars/:id'> {
		const body = await parseBody(request, CalendarInit);

		await authRequestForItem(request, 'calendars', id, { edit: true });

		return withEncoded(
			await database
				.updateTable('calendars')
				.set(body)
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update calendar'))
		);
	},
	async DELETE(request: Request, { id }): AsyncResult<'DELETE', 'calendars/:id'> {
		await authRequestForItem(request, 'calendars', id, { manage: true });

		return withEncoded(
			await database
				.deleteFrom('calendars')
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not delete calendar'))
		);
	},
});

function withAttendees(eb: ExpressionBuilder<Schema, 'events'>): AliasedRawBuilder<Attendee[], 'attendees'> {
	return jsonArrayFrom(
		eb.selectFrom('attendees').selectAll().whereRef('eventId', '=', 'events.id').$narrowType<{ status: AttendeeStatus }>()
	).as('attendees');
}

function withCalendar(eb: ExpressionBuilder<Schema, 'events'>): AliasedRawBuilder<Calendar, 'calendar'> {
	return jsonObjectFrom(eb.selectFrom('calendars').selectAll().whereRef('id', '=', 'events.calId'))
		.$castTo<Calendar>() // json dates
		.as('calendar');
}

addRoute({
	path: '/api/calendars/:id/events',
	params: { id: z.uuid() },
	async GET(request: Request, { id }): AsyncResult<'GET', 'calendars/:id/events'> {
		const filter = parseSearch(request, EventFilter);

		const { item: calendar } = await authRequestForItem(request, 'calendars', id, { read: true });

		const events: Event[] = await database
			.selectFrom('events')
			.selectAll()
			.select(withAttendees)
			.where('calId', '=', id)
			.where(sql<boolean>`(${sql.ref('start')}, ${sql.ref('end')}) OVERLAPS (${sql.val(filter.start)}, ${sql.val(filter.end)})`)
			.limit(1000)
			.execute()
			.then(result => result.map<Event>(withEncoded))
			.catch(withError('Could not get events'));

		for (const event of events) event.calendar = withEncoded(calendar);

		return events;
	},
	async PUT(request: Request, { id }): AsyncResult<'PUT', 'calendars/:id/events'> {
		const { attendees: attendeesInit = [], sendEmails, recurrenceUpdateAll, ...init } = await parseBody(request, EventInit);

		const { item: calendar } = await authRequestForItem(request, 'calendars', id, { edit: true });

		const tx = await database.startTransaction().execute();
		try {
			const event = await tx
				.insertInto('events')
				.values({ ...withDecoded(init), calId: id })
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not create event'));

			const attendees = Attendee.array().parse(
				attendeesInit.length
					? await tx
							.insertInto('attendees')
							.values(attendeesInit.map(a => ({ ...a, eventId: event.id })))
							.returningAll()
							.execute()
					: []
			);

			await tx.commit().execute();
			return Object.assign(event, {
				attendees,
				calendar: withEncoded(calendar),
				color: event.color?.toString(16)?.padStart(8, '0'),
			});
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
});

addRoute({
	path: '/api/events/:id',
	params: { id: z.uuid() },
	async GET(request: Request, { id }): AsyncResult<'GET', 'events/:id'> {
		const { userId } = await requireSession(request);

		const event = await database
			.selectFrom('events')
			.selectAll()
			.select(withAttendees)
			.select(withCalendar)
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Event does not exist', 404));

		if (event.calendar.userId != userId && event.attendees.every(a => a.userId != userId))
			error(403, 'You do not have access to this event');

		return withEncoded(event);
	},
	async PATCH(request: Request, { id }): AsyncResult<'PATCH', 'events/:id'> {
		const { attendees: attendeesInit = [], sendEmails, recurrenceUpdateAll, ...init } = await parseBody(request, EventInit);

		const { calId } = await database
			.selectFrom('events')
			.select('calId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Event does not exist', 404));

		await authRequestForItem(request, 'calendars', calId, { edit: true });
		if (calId != init.calId) await authRequestForItem(request, 'calendars', init.calId, { edit: true });

		const tx = await database.startTransaction().execute();

		try {
			const event = await tx
				.updateTable('events')
				.set(withDecoded(init))
				.where('id', '=', id)
				.returningAll()
				.returning(withAttendees)
				.returning(withCalendar)
				.executeTakeFirstOrThrow()
				.catch(withError('Could not update event'));

			if (calId != init.calId) {
				await tx
					.updateTable('events')
					.set({ calId: init.calId })
					.where('recurrenceId', '=', id)
					.execute()
					.catch(withError('Failed to update calendar for dependent events'));
			}

			const attendeeInitMap = new Map(attendeesInit.map(a => [a.email, a]));

			for (const attendee of event.attendees) {
				const userInit = attendee.userId && attendeeInitMap.get(attendee.userId);
				const init = attendeeInitMap.get(attendee.email);

				if (!userInit && !init) continue;

				/**
				 * @todo update attendees
				 * Need to handle:
				 * - Changing name
				 */
			}

			await tx.commit().execute();
			return withEncoded(event);
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
	async DELETE(request: Request, { id }): AsyncResult<'DELETE', 'events/:id'> {
		const { calId } = await database
			.selectFrom('events')
			.select('calId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Event does not exist', 404));

		await authRequestForItem(request, 'calendars', calId, { manage: true });

		const tx = await database.startTransaction().execute();

		try {
			const event = await tx
				.deleteFrom('events')
				.returningAll()
				.returning(withAttendees)
				.returning(withCalendar)
				.where('id', '=', id)
				.executeTakeFirstOrThrow();

			await tx.commit().execute();
			return withEncoded(event);
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
});
