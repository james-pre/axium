<script lang="ts">
	import { getEvents, type EventInitFormData } from '@axium/calendar/client';
	import type { Calendar, Event, EventData } from '@axium/calendar/common';
	import {
		AttendeeInit,
		dateToInputValue,
		eventToICS,
		formatEventTimes,
		getCalPermissionsInfo,
		weekDaysFor,
	} from '@axium/calendar/common';
	import * as Cal from '@axium/calendar/components';
	import { contextMenu, dynamicRows } from '@axium/client/attachments';
	import { AccessControlDialog, ColorPicker, FormDialog, Icon, Popover, UserDiscovery } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import { colorHashHex, encodeColor, decodeColor } from '@axium/core/color';
	import { SvelteDate } from 'svelte/reactivity';
	import { _throw } from 'utilium';
	import { download } from 'utilium/dom.js';
	import z from 'zod';
	const { data } = $props();

	const { user } = data.session;

	const now = new SvelteDate();
	setInterval(() => now.setTime(Date.now()), 60_000);
	const today = $derived(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

	let start = new SvelteDate(data.filter.start);
	let end = new SvelteDate(data.filter.end);
	let calendars = $state(data.calendars);
	let events = $state<Event[]>([]);

	$effect(() => {
		for (const cal of calendars) cal.color ||= encodeColor(colorHashHex(cal.name));
		getEvents(calendars, { start: new Date(start.getTime()), end: new Date(end.getTime()) }).then(e => (events = e));
	});

	const tz = new Date().toLocaleString('en', { timeStyle: 'long' }).split(' ').slice(-1)[0];

	const span = $state('week');
	const spanDays = $derived(span == 'week' ? 7 : _throw('Invalid span value'));
	const weekDays = $derived(weekDaysFor(start));
	const eventsForWeekDays = $derived(
		Object.groupBy(
			events.filter(
				e => e.start < new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate() + 1) && e.end > weekDays[0]
			),
			ev => ev?.start.getDay()
		)
	);

	let dialogs = $state<Record<string, HTMLDialogElement>>({});

	const defaultEventInit = {
		attendees: [],
		recurrenceExcludes: [],
		recurrenceId: null,
		calId: calendars[0]?.id,
	} as any;

	let eventInit = $state<EventData & { attendees: AttendeeInit[]; calendar?: Calendar }>(defaultEventInit),
		eventInitStart = $derived(dateToInputValue(eventInit.start)),
		eventInitEnd = $derived(dateToInputValue(eventInit.end)),
		eventEditId = $state<string>(),
		eventEditCalId = $state<string>();

	const defaultEventColor = $derived((eventInit.calendar || calendars[0])?.color || encodeColor(colorHashHex(user.name)));
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div id="cal-app">
	<button class="event-init icon-text" command="show-modal" commandfor="event-init"><Icon i="plus" /> New Event</button>
	<div class="bar">
		<button onclick={() => start.setTime(today.getTime())}>Today</button>
		<button
			style:display="contents"
			onclick={() => {
				start.setDate(start.getDate() - spanDays);
				end.setDate(end.getDate() - spanDays);
			}}><Icon i="chevron-left" /></button
		>
		<button
			style:display="contents"
			onclick={() => {
				start.setDate(start.getDate() + spanDays);
				end.setDate(end.getDate() + spanDays);
			}}><Icon i="chevron-right" /></button
		>
		<span class="label">{weekDays[0].toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
	</div>
	<div id="cal-list">
		<Cal.Select bind:start bind:end />
		<div class="cal-list-header">
			<h4>My Calendars</h4>
			<button style:display="contents" command="show-modal" commandfor="add-calendar">
				<Icon i="plus" />
			</button>
		</div>
		{#each calendars.filter(cal => cal.userId == user.id) as cal (cal.id)}
			<div
				class="cal-list-item"
				{@attach contextMenu(
					{ i: 'pencil', text: 'Rename', action: () => dialogs['rename:' + cal.id].showModal() },
					{ i: 'user-group', text: 'Share', action: () => dialogs['share:' + cal.id].showModal() },
					{ i: 'trash', text: 'Delete', action: () => dialogs['delete:' + cal.id].showModal() }
				)}
			>
				<span>{cal.name}</span>
				<Popover showToggle="hover">
					<div class="menu-item" onclick={() => dialogs['rename:' + cal.id].showModal()}>
						<Icon i="pencil" /> Rename
					</div>
					<div class="menu-item" onclick={() => dialogs['share:' + cal.id].showModal()}>
						<Icon i="user-group" /> Share
					</div>
					<div class="menu-item" onclick={() => dialogs['delete:' + cal.id].showModal()}>
						<Icon i="trash" /> Delete
					</div>
				</Popover>
				<FormDialog
					bind:dialog={dialogs['rename:' + cal.id]}
					submitText="Save"
					submit={(input: { name: string }) =>
						fetchAPI('PATCH', 'calendars/:id', input, cal.id).then(result => Object.assign(cal, result))}
				>
					<div>
						<label for="name">Name</label>
						<input name="name" type="text" required value={cal.name} />
					</div>
				</FormDialog>
				<AccessControlDialog editable itemType="calendars" item={cal} bind:dialog={dialogs['share:' + cal.id]} />
				<FormDialog
					bind:dialog={dialogs['delete:' + cal.id]}
					submitText="Delete"
					submitDanger
					submit={() => fetchAPI('DELETE', 'calendars/:id', null, cal.id).then(() => calendars.splice(calendars.indexOf(cal), 1))}
				>
					<p>
						Are you sure you want to delete the calendar "{cal.name}"?<br />
						<strong>This action cannot be undone.</strong>
					</p>
				</FormDialog>
			</div>
		{/each}
		{#if calendars.some(cal => cal.userId != user.id)}
			<div class="cal-list-header">
				<h4>Shared Calendars</h4>
			</div>
			{#each calendars.filter(cal => cal.userId != user.id) as cal (cal.id)}
				{@const { list, icon } = getCalPermissionsInfo(cal, user)}
				<dfn title={list}>
					<Icon i={icon} />
				</dfn>
			{/each}
		{/if}
	</div>
	<div id="cal">
		<div class="hours subtle">
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
			<div class="cal-content week">
				{#each weekDays as day, i}
					<div class="day">
						<div class="day-header">
							<span class="subtle">{day.toLocaleString('en', { weekday: 'short' })}</span>
							<span class={['day-number', today.getTime() == day.getTime() && 'today']}>{day.getDate()}</span>
						</div>

						<div class="day-content">
							{#each eventsForWeekDays[i] ?? [] as event}
								<Popover id="event-popover:{event.id}" onclick={e => e.stopPropagation()}>
									{#snippet toggle()}
										{@const start = event.start.getHours() * 60 + event.start.getMinutes()}
										{@const end = event.end.getHours() * 60 + event.end.getMinutes()}
										<div
											class="event"
											style:top="{start / 14.4}%"
											style:height="{(end - start) / 14.4}%"
											style="--event-color:{decodeColor(
												event.color ||
													event.calendar!.color ||
													encodeColor(colorHashHex(event.calendar!.name), true)
											)}"
											{@attach contextMenu(
												{
													i: 'pencil',
													text: 'Edit',
													action: () => {
														eventEditId = event.id;
														eventEditCalId = event.calId;
														eventInit = event;
														document.querySelector<HTMLDialogElement>('#event-init')!.showModal();
													},
												},
												{
													i: 'file-export',
													text: 'Export .ics',
													action: () => download(event.summary + '.ics', eventToICS(event)),
												}
												{
													i: 'trash-can',
													text: 'Delete',
													action: () => {
														eventEditId = event.id;
														document.querySelector<HTMLDialogElement>('#event-delete')!.showModal();
													},
												}
											)}
										>
											<span>{event.summary}</span>
											<span class="subtle">{formatEventTimes(event)}</span>
										</div>
									{/snippet}

									<div class="event-actions">
										<button
											class="reset"
											onclick={() => {
												eventEditId = event.id;
												eventEditCalId = event.calId;
												eventInit = event;
											}}
											command="show-modal"
											commandfor="event-init"><Icon i="pencil" /></button
										>
										<button class="reset" onclick={() => download(event.summary + '.ics', eventToICS(event))}
											><Icon i="file-export" /></button
										>
										<button
											class="reset"
											onclick={() => (eventEditId = event.id)}
											command="show-modal"
											commandfor="event-delete"><Icon i="trash-can" /></button
										>
										<button class="reset" command="hide-popover" commandfor="event-popover:{event.id}"
											><Icon i="xmark" /></button
										>
									</div>

									<h3>{event.summary}</h3>

									<div>
										<Icon i="clock" />
										<span>
											{#if event.start.getDate() == event.end.getDate()}
												{event.start.toLocaleDateString()}, {formatEventTimes(event)}
											{:else if event.isAllDay}
												{event.start.toLocaleDateString()} - {event.end.toLocaleDateString()}
											{:else}
												{event.start.toLocaleString()} - {event.end.toLocaleString()}
											{/if}
										</span>
									</div>

									{#if event.location}
										<div>
											<Icon i="location-dot" />
											<span>{event.location}</span>
										</div>
									{/if}

									<div>
										<Icon i="calendar" />
										<span>
											{#if event.calendar}
												{event.calendar.name}
											{:else}
												<i>Unknown Calendar</i>
											{/if}
										</span>
									</div>

									{#if event.attendees.length}
										<div class="attendees-container">
											<Icon i="user-group" />
											<div class="attendees">
												{#each event.attendees ?? [] as attendee (attendee.email)}
													<div class="attendee">{attendee.email}</div>
												{/each}
											</div>
										</div>
									{/if}

									{#if event.description}
										<div class="description">
											<Icon i="block-quote" />
											<span>{event.description}</span>
										</div>
									{/if}
								</Popover>
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
	cancel={() => (eventInit = defaultEventInit)}
	submitText={eventEditId ? 'Update' : 'Create'}
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
	<input name="summary" type="text" required placeholder="Add title" bind:value={eventInit.summary} />
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
				<label for="eventInit.isAllDay:checkbox">All day</label>
				<div class="spacing"></div>
				<select class="recurrence">
					<!-- @todo -->
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
		<input name="location" id="eventInit.location" placeholder="Add location" bind:value={eventInit.location} />
	</div>

	<div>
		<label for="eventInit.description"><Icon i="block-quote" /></label>
		<textarea
			name="description"
			id="eventInit.description"
			placeholder="Add description"
			bind:value={eventInit.description}
			{@attach dynamicRows()}
		></textarea>
	</div>
</FormDialog>

<FormDialog
	id="event-delete"
	submitText="Delete"
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
	<p>Are you sure you want to delete this event?</p>
</FormDialog>

<FormDialog
	id="add-calendar"
	submitText="Create"
	submit={(input: { name: string }) =>
		fetchAPI('PUT', 'users/:id/calendars', input, user.id).then(cal => calendars.push({ ...cal, acl: [] }))}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required />
	</div>
</FormDialog>

<style>
	:global(body) {
		top: 5em;
	}

	#cal-app {
		display: grid;
		grid-template-rows: 3em 1fr;
		grid-template-columns: 15em 1fr;
		inset: 0;
		position: absolute;
	}

	button.event-init {
		margin: 0.5em;
		background-color: var(--bg-alt);
		text-align: center;
		justify-content: center;
	}

	:global {
		form {
			div:has(label ~ input),
			div:has(label ~ textarea),
			div:has(label ~ select) {
				display: flex;
				flex-direction: row;
				gap: 0.5em;
			}
		}
	}

	div.event-times-container,
	div.attendees-container {
		display: flex;
		flex-direction: row;
		gap: 0.5em;
	}

	div.event-times,
	div.attendees {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		flex-grow: 1;
	}

	h3,
	h4 {
		margin: 0;
	}

	:global {
		#event-init form {
			width: 25em;

			.event-time-options {
				display: flex;
				align-items: center;
				gap: 0.5em;

				.spacing {
					flex-grow: 1;
				}
			}

			input,
			select,
			textarea {
				flex-grow: 1;
			}

			textarea {
				padding: 0.5em;
				font-size: 16px;
			}
		}
	}

	.bar {
		display: flex;
		gap: 1em;
		align-items: center;
		font-weight: bold;
	}

	#cal-list {
		display: flex;
		flex-direction: column;
		gap: 1em;
		grid-column: 1;
		padding: 1em;

		.cal-list-header,
		.cal-list-item {
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
	}

	#cal {
		display: flex;
		width: 100%;
		height: 100%;
		padding: 1em;
		border-radius: 1em;
		background-color: var(--bg-menu);

		.hours {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			text-align: right;
			justify-content: space-around;
			overflow-x: visible;
			margin-top: 5em;
		}

		.hour {
			position: relative;
			padding-right: 1em;
		}

		.hour:not(.empty)::after {
			content: '';
			position: absolute;
			left: calc(100% - 0.5em);
			width: calc(100vw - 22em);
			border-bottom: 1px solid var(--border-accent);
			top: 50%;
			z-index: 0;
			pointer-events: none;
		}

		.cal-content {
			display: flex;
			width: 100%;
			height: 100%;
			justify-content: space-around;
		}

		.day {
			width: 100%;
			height: 100%;
			border-left: 1px solid var(--border-accent);
			display: flex;
			flex-direction: column;

			.day-header {
				display: flex;
				text-align: center;
				align-items: center;
				justify-content: center;
				gap: 0.5em;
				user-select: none;
				height: 5.9em;
				flex-shrink: 0;

				.day-number {
					border-radius: 0.3em;
					width: 2em;
					height: 2em;
					display: inline-flex;
					align-items: center;
					justify-content: center;

					&.today {
						border: 1px solid var(--border-accent);
						color: var(--fg-accent);
					}
				}
			}

			.day-content {
				flex-grow: 1;
				position: relative;

				.now {
					position: absolute;
					width: 100%;
					border-bottom: 1px solid hsl(0 33 var(--fg-light));
					z-index: 9;
					pointer-events: none;

					&::before {
						content: '';
						position: absolute;
						left: -0.25em;
						top: -0.25em;
						width: 0.5em;
						height: 0.5em;
						border-radius: 50%;
						background-color: hsl(0 33 var(--fg-light));
					}
				}
			}

			.event {
				width: calc(100% - 0.5em);
				position: absolute;
				border-radius: 0.5em;
				padding: 0.25em;
				background-color: var(--event-color, var(--bg-alt));
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				justify-content: flex-start;
				container-type: size;
				overflow: hidden;

				@container (height < 2.5em) {
					.subtle {
						display: none;
					}
				}

				:global(& + :popover-open) {
					gap: 0.75em;
					padding: 1em;

					.event-actions {
						display: flex;
						align-items: center;
						justify-content: flex-end;
						gap: 0.25em;

						button {
							padding: 0.5em;
							border-radius: 0.5em;
						}
					}
				}
			}
		}
	}
</style>
