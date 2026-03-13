<script lang="ts">
	import { getEvents, type EventInitFormData, type EventInitProp } from '@axium/calendar/client';
	import type { Event } from '@axium/calendar/common';
	import {
		CalendarInit,
		dateToInputValue,
		fromRRuleDate,
		getCalPermissionsInfo,
		longWeekDay,
		toByDay,
		toRRuleDate,
		weekDayOfMonth,
		weekDaysFor,
		withOrdinalSuffix,
	} from '@axium/calendar/common';
	import * as Cal from '@axium/calendar/components';
	import { fetchAPI, text } from '@axium/client';
	import { contextMenu, dynamicRows } from '@axium/client/attachments';
	import { AccessControlDialog, ColorPicker, FormDialog, Icon, Popover, UserDiscovery } from '@axium/client/components';
	import { colorHashHex, encodeColor } from '@axium/core/color';
	import { rrulestr } from 'rrule';
	import { useSwipe } from 'svelte-gestures';
	import { SvelteDate } from 'svelte/reactivity';
	import { _throw } from 'utilium';
	import * as z from 'zod';
	import './cal.css';

	const { data } = $props();

	const { user } = data.session;

	const now = new SvelteDate();
	now.setMilliseconds(0);
	setInterval(() => now.setTime(Date.now()), 60_000);
	const today = $derived(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
	const defaultStart = $derived(
		new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.round(now.getMinutes() / 30) * 30, 0, 0)
	);

	let start = new SvelteDate(data.filter.start);
	let end = new SvelteDate(data.filter.end);
	let calendars = $state(data.calendars);
	let events = $state<Event[]>([]);

	$effect(() => {
		for (const cal of calendars) cal.color ||= encodeColor(colorHashHex(cal.name));
		getEvents(calendars, { start: new Date(start.getTime()), end: new Date(end.getTime()) }).then(e => (events = e));
		calSidebar?.classList.remove('active');
	});

	const tz = new Date().toLocaleString('en', { timeStyle: 'long' }).split(' ').slice(-1)[0];

	const span = $state('week');
	const spanDays = $derived(span == 'week' ? 7 : _throw('Invalid span value'));
	const weekDays = $derived(weekDaysFor(start));

	let dialogs = $state<Record<string, HTMLDialogElement>>({});

	const defaultEventInit = $derived<any>({
		attendees: [],
		recurrenceExcludes: [],
		recurrenceId: null,
		calId: calendars[0]?.id,
		start: new Date(defaultStart),
		end: new Date(defaultStart.getTime() + 3600_000),
	});

	let eventInit = $state<EventInitProp>(defaultEventInit),
		eventInitStart = $derived(dateToInputValue(eventInit.start)),
		eventInitEnd = $derived(dateToInputValue(eventInit.end)),
		eventEditId = $state<string>(),
		eventEditCalId = $state<string>();

	const defaultCalInit = {
		color: null,
	} as CalendarInit;

	let calInit = $state<CalendarInit>(defaultCalInit),
		calEditId = $state<string>();

	const recurringEvents = $derived(
		events
			.filter(ev => ev.recurrence)
			.map(ev => {
				const rule = rrulestr('RRULE:' + ev.recurrence, { dtstart: toRRuleDate(ev.start) });
				const recurrences = rule
					.between(toRRuleDate(new Date(start.getTime())), toRRuleDate(new Date(end.getTime())), true)
					.map(fromRRuleDate);
				return { ...ev, rule, recurrences };
			})
	);

	const defaultCalColor = encodeColor(colorHashHex(user.name));
	const defaultEventColor = $derived((eventInit.calendar || calendars[0])?.color || defaultCalColor);

	let calSidebar = $state<HTMLDivElement>();
</script>

<svelte:head>
	<title>{text('app_name.calendar')}</title>
</svelte:head>

<div id="cal-app">
	<div id="event-init-container">
		<button class="event-init icon-text mobile-hide" command="show-modal" commandfor="event-init">
			<Icon i="plus" />
			<span>{text('calendar.new_event')}</span>
		</button>
	</div>
	<div class="bar">
		<!-- desktop -->
		<button class="mobile-hide" onclick={() => start.setTime(today.getTime())}>{text('calendar.today')}</button>
		<button
			class="reset mobile-hide"
			onclick={() => {
				start.setDate(start.getDate() - spanDays);
				end.setDate(end.getDate() - spanDays);
			}}><Icon i="chevron-left" /></button
		>
		<button
			class="reset mobile-hide"
			onclick={() => {
				start.setDate(start.getDate() + spanDays);
				end.setDate(end.getDate() + spanDays);
			}}><Icon i="chevron-right" /></button
		>

		<!-- mobile -->
		<button class="reset mobile-only icon-text" onclick={() => calSidebar?.classList.toggle('active')}><Icon i="bars" /></button>

		<!-- shared -->
		<span class="label">{weekDays[0].toLocaleString('default', { month: 'long', year: 'numeric' })}</span>

		<!-- mobile -->
		<button class="reset mobile-only" onclick={() => start.setTime(today.getTime())}>
			<span class="day-number today">{today.getDate()}</span>
		</button>
		<button class="reset mobile-only icon-text" command="show-modal" commandfor="event-init"><Icon i="plus" /></button>
	</div>
	<div id="cal-sidebar" bind:this={calSidebar}>
		<Cal.Select bind:start bind:end />
		<div class="cal-sidebar-header">
			<h4>{text('calendar.list_owned')}</h4>
			<button style:display="contents" command="show-modal" commandfor="cal-init">
				<Icon i="plus" />
			</button>
		</div>
		{#each calendars.filter(cal => cal.userId == user.id) as cal (cal.id)}
			{@const edit = () => {
				calEditId = cal.id;
				calInit = cal;
				document.querySelector<HTMLDialogElement>('#cal-init')!.showModal();
			}}
			<div
				class="cal-sidebar-item"
				{@attach contextMenu(
					{ i: 'pencil', text: text('calendar.edit'), action: edit },
					{ i: 'user-group', text: text('generic.share'), action: () => dialogs['share:' + cal.id].showModal() },
					{ i: 'trash', text: text('generic.delete'), action: () => dialogs['delete:' + cal.id].showModal() }
				)}
			>
				<span>{cal.name}</span>
				<Popover showToggle="hover">
					<button
						class="reset menu-item"
						command="show-modal"
						commandfor="cal-init"
						onclick={() => {
							calEditId = cal.id;
							calInit = { ...cal };
						}}
					>
						<Icon i="pencil" />
						<span>{text('calendar.edit')}</span>
					</button>
					<div class="menu-item" onclick={() => dialogs['share:' + cal.id].showModal()}>
						<Icon i="user-group" />
						<span>{text('generic.share')}</span>
					</div>
					<div class="menu-item" onclick={() => dialogs['delete:' + cal.id].showModal()}>
						<Icon i="trash" />
						<span>{text('generic.delete')}</span>
					</div>
				</Popover>
				<AccessControlDialog editable itemType="calendars" item={cal} bind:dialog={dialogs['share:' + cal.id]} />
				<FormDialog
					bind:dialog={dialogs['delete:' + cal.id]}
					submitText={text('generic.delete')}
					submitDanger
					submit={() => fetchAPI('DELETE', 'calendars/:id', null, cal.id).then(() => calendars.splice(calendars.indexOf(cal), 1))}
				>
					<p>
						<span>{text('calendar.delete_confirm', { name: cal.name })}</span>
						<br />
						<strong>{text('generic.action_irreversible')}</strong>
					</p>
				</FormDialog>
			</div>
		{/each}
		{#if calendars.some(cal => cal.userId != user.id)}
			<div class="cal-sidebar-header">
				<h4>{text('calendar.list_shared')}</h4>
			</div>
			{#each calendars.filter(cal => cal.userId != user.id) as cal (cal.id)}
				{@const { list, icon } = getCalPermissionsInfo(cal, user)}
				<dfn title={list}>
					<Icon i={icon} />
				</dfn>
			{/each}
		{/if}
	</div>
	<div
		id="cal"
		{...useSwipe(
			e => {
				if (e.detail.pointerType != 'touch') return;
				switch (e.detail.direction) {
					case 'left':
						start.setDate(start.getDate() + spanDays);
						end.setDate(end.getDate() + spanDays);
						break;
					case 'right':
						start.setDate(start.getDate() - spanDays);
						end.setDate(end.getDate() - spanDays);
						break;
					case 'top':
					case 'bottom':
				}
			},
			() => ({ touchAction: 'pan-y' })
		)}
	>
		<div id="hours" class="subtle">
			{#each { length: 24 }, i}
				{#if !i}
					<span class="hour">{tz}</span>
				{:else}
					<span class="hour">{i}:00</span>
				{/if}
			{/each}
			<span class="hour empty"></span>
		</div>
		{#if span == 'week'}
			{@const eventsForWeekDays = Object.groupBy(
				events.filter(
					e =>
						e.start < new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate() + 1) &&
						e.end > weekDays[0]
				),
				ev => ev.start.getDay()
			)}
			<div class="cal-content week">
				{#each weekDays as day, i}
					<div class="day">
						<div class="day-header">
							<span class="subtle">{day.toLocaleString('en', { weekday: 'short' })}</span>
							<span class={['day-number', today.getTime() == day.getTime() && 'today']}>{day.getDate()}</span>
						</div>

						<div class="day-content">
							{#each eventsForWeekDays[i] ?? [] as event}
								<Cal.Event bind:eventEditId bind:eventEditCalId bind:eventInit {event} />
							{/each}

							{#each recurringEvents.flatMap(ev => ev.recurrences
									.filter(r => r.getFullYear() == day.getFullYear() && r.getMonth() == day.getMonth() && r.getDate() == day.getDate())
									.map( r => [ev, { ...ev, start: r, end: new Date(r.getTime() + ev.end.getTime() - ev.start.getTime()) }] )) as [initData, event]}
								<Cal.Event bind:eventEditId bind:eventEditCalId bind:eventInit {event} {initData} />
							{/each}

							{#if today.getTime() == day.getTime()}
								<div class="now" style:top="{(now.getHours() * 60 + now.getMinutes()) / 14.4}%"></div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<FormDialog
	id="event-init"
	clearOnCancel
	cancel={() => {
		eventInit = defaultEventInit;
		eventEditId = undefined;
		eventEditCalId = undefined;
	}}
	submitText={text(eventEditId ? 'event_init.submit_edit' : 'generic.create')}
	submit={async (data: EventInitFormData) => {
		Object.assign(eventInit, data);
		const calendar = calendars.find(cal => cal.id == eventInit.calId);
		if (!calendar) throw 'Invalid calendar';
		if (!eventEditId) {
			const event: Event = await fetchAPI('PUT', 'calendars/:id/events', { ...eventInit, sendEmails: false }, eventInit.calId);
			event.calendar = calendar;
			events.push(event);
			return;
		}

		const event: Event = await fetchAPI('PATCH', 'events/:id', { ...eventInit, sendEmails: false }, eventEditId);
		event.calendar = calendar;
		const existing = events.find(e => e.id == eventEditId);
		if (!existing) console.warn('Could not find event to update');
		else Object.assign(existing, event);
		return;
	}}
>
	<input name="summary" type="text" required placeholder={text('event_init.title_placeholder')} bind:value={eventInit.summary} />
	<div class="event-times-container">
		<label for="eventInit.start"><Icon i="clock" /></label>
		<div class="event-times">
			<input
				type="datetime-local"
				name="start"
				id="eventInit.start"
				bind:value={eventInitStart}
				onchange={e => (eventInit.start = new Date(e.currentTarget.value))}
				required
			/>
			<input
				type="datetime-local"
				name="end"
				id="eventInit.end"
				bind:value={eventInitEnd}
				onchange={e => (eventInit.end = new Date(e.currentTarget.value))}
				required
			/>
			<div class="event-time-options">
				<input bind:checked={eventInit.isAllDay} id="eventInit.isAllDay:checkbox" type="checkbox" />
				<label for="eventInit.isAllDay:checkbox" class="checkbox">
					{#if eventInit.isAllDay}<Icon i="check" --size="1.3em" />{/if}
				</label>
				<label for="eventInit.isAllDay:checkbox">{text('event_init.all_day')}</label>
				<div class="spacing"></div>
				<select name="recurrence" bind:value={eventInit.recurrence}>
					<option value="">{text('event_init.recurrence.none')}</option>
					<option value="FREQ=DAILY">{text('event_init.recurrence.daily')}</option>
					<option value="FREQ=WEEKLY;BYDAY={toByDay(eventInit.start)}">
						{text('event_init.recurrence.weekly', { day: longWeekDay(eventInit.start) })}
					</option>
					<option value="FREQ=MONTHLY;BYDAY={Math.ceil(eventInit.start.getDate() / 7) + toByDay(eventInit.start)}"
						>{text('event_init.recurrence.monthly_on', { day: weekDayOfMonth(eventInit.start) })}
					</option>
					<option value="FREQ=MONTHLY;BYMONTHDAY={eventInit.start.getDate()}">
						{text('event_init.recurrence.monthly_on', { day: withOrdinalSuffix(eventInit.start.getDate()) })}
					</option>
					<option value="FREQ=YEARLY;BYMONTH={eventInit.start.getMonth()};BYMONTHDAY={eventInit.start.getDate()}">
						{text('event_init.recurrence.yearly', {
							date: eventInit.start.toLocaleDateString('default', { month: 'long', day: 'numeric' }),
						})}
					</option>
					<!-- @todo <option value="">Custom</option> -->
				</select>
			</div>
		</div>
	</div>

	<div>
		<label for="eventInit.calId"><Icon i="calendar" /></label>
		<select id="eventInit.calId" name="calId" required bind:value={eventInit.calId}>
			{#each calendars.filter(cal => cal.userId == user.id || getCalPermissionsInfo(cal, user).perms.edit) as cal (cal.id)}
				<option value={cal.id}>{cal.name}</option>
			{/each}
		</select>
		<ColorPicker bind:value={eventInit.color} defaultValue={defaultEventColor} />
	</div>

	<div class="attendees-container">
		<label for="eventInit.attendee"><Icon i="user-group" /></label>
		<div class="attendees">
			<UserDiscovery
				noRoles
				allowExact
				onSelect={target => {
					const { data: userId } = z.uuid().safeParse(target);
					const { data: email } = z.email().safeParse(target);
					if (!userId && !email) throw 'Can not determine attendee: ' + target;
					if (!email) throw 'Specifying attendees without an email is not supported yet';
					// @todo supports roles and also contacts
					eventInit.attendees.push({ userId, email });
				}}
			/>
			{#each eventInit.attendees as attendee (attendee.email)}
				<div class="attendee">{attendee.email}</div>
			{/each}
		</div>
	</div>

	<div>
		<label for="eventInit.location"><Icon i="location-dot" /></label>
		<input
			name="location"
			id="eventInit.location"
			placeholder={text('event_init.location_placeholder')}
			bind:value={eventInit.location}
		/>
	</div>

	<div>
		<label for="eventInit.description"><Icon i="block-quote" /></label>
		<textarea
			name="description"
			id="eventInit.description"
			placeholder={text('event_init.description_placeholder')}
			bind:value={eventInit.description}
			{@attach dynamicRows()}
		></textarea>
	</div>
</FormDialog>

<FormDialog
	id="event-delete"
	submitText={text('generic.delete')}
	submitDanger
	submit={async () => {
		if (!eventEditId) throw new Error('No event to delete');
		await fetchAPI('DELETE', 'events/:id', null, eventEditId);
		const i = events.findIndex(e => e.id == eventEditId);
		if (i == -1) console.warn('Could not find event to delete');
		else events.splice(i, 1);
		eventEditId = undefined;
	}}
>
	<p>{text('event_delete.confirm')}</p>
</FormDialog>

<FormDialog
	id="cal-init"
	clearOnCancel
	cancel={() => {
		calInit = defaultCalInit;
		calEditId = undefined;
	}}
	submitText={text(calEditId ? 'calendar_init.submit_edit' : 'generic.create')}
	submit={async (data: Record<keyof CalendarInit, string>) => {
		Object.assign(calInit, data);

		if (!calEditId) {
			const cal = await fetchAPI('PUT', 'users/:id/calendars', calInit, user.id);
			calendars.push({ ...cal, acl: [] });
			return;
		}

		const cal = calendars.find(cal => cal.id == calEditId);

		const result = await fetchAPI('PATCH', 'calendars/:id', calInit, calEditId);

		if (cal) Object.assign(cal, result);
		else console.warn('Could not find calendar to update');
	}}
>
	<div>
		<label for="calInit.name">{text('calendar_init.name')}</label>
		<input id="calInit.name" bind:value={calInit.name} required />
	</div>

	<div>
		<label for="calInit.color">{text('calendar_init.color')}</label>
		<ColorPicker bind:value={calInit.color} defaultValue={defaultCalColor} />
	</div>
</FormDialog>
