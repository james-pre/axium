<script lang="ts">
	import type { EventInitFormData } from '@axium/calendar/client';
	import { getCalPermissionsInfo, weekDaysFor, type Event, type EventInit } from '@axium/calendar/common';
	import * as Calendar from '@axium/calendar/components';
	import { contextMenu, dynamicRows } from '@axium/client/attachments';
	import { AccessControlDialog, FormDialog, Icon, Popover } from '@axium/client/components';
	import UserDiscovery from '@axium/client/components/UserDiscovery';
	import { fetchAPI } from '@axium/client/requests';
	import { SvelteDate } from 'svelte/reactivity';
	import { _throw, type WithRequired } from 'utilium';
	import z from 'zod';
	const { data } = $props();

	const { user } = data.session;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	let start = new SvelteDate(data.filter.start);
	let end = new SvelteDate(data.filter.end);
	let calendars = $state(data.calendars);

	const tz = new Date().toLocaleString('en', { timeStyle: 'long' }).split(' ').slice(-1)[0];

	const span = $state('week');
	const spanDays = $derived(span == 'week' ? 7 : _throw('Invalid span value'));
	const weekDays = $derived(weekDaysFor(start));

	let dialogs = $state<Record<string, HTMLDialogElement>>({});

	let eventInit = $state<WithRequired<EventInit, 'attendees'>>({ attendees: [] } as any);
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div id="cal-app">
	<button class="new-event icon-text" command="show-modal" commandfor="new-event"><Icon i="plus" /> New Event</button>
	<div class="bar">
		<button onclick={() => start.setTime(today.getTime())}>Today</button>
		<span class="label">{weekDays[0].toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
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
	</div>
	<div id="cal-list">
		<Calendar.Select bind:start bind:end />
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
			{#each { length: 23 }, i}
				{#if !i}
					<span class="hour">{tz}</span>
				{:else}
					<span class="hour">{i + 1}:00</span>
				{/if}
			{/each}
			<span class="hour empty"></span>
		</div>
		{#if span == 'week'}
			<div class="cal-content week">
				{#each weekDays as day}
					<div class="day">
						<div class="day-header">
							<span class="subtle">{day.toLocaleString('en', { weekday: 'short' })}</span>
							<span class={['day-number', today.getTime() == day.getTime() && 'today']}>{day.getDate()}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<FormDialog
	id="new-event"
	clearOnCancel
	cancel={() => (eventInit = { attendees: [] } as any)}
	submitText="Create"
	submit={async (data: EventInitFormData) => {
		const calendar = calendars.find(cal => cal.id == data.calId);
		if (!calendar) throw 'Invalid calendar';
		const event: Event = await fetchAPI(
			'PUT',
			'calendars/:id/events',
			{ ...data, ...eventInit, recurrenceExcludes: [], recurrenceId: null },
			data.calId
		);
		event.calendar = calendar;
		calendar.events?.push(event);
	}}
>
	<input name="summary" type="text" required placeholder="Add title" />
	<div class="event-times-container">
		<label for="eventInit.start"><Icon i="clock" /></label>
		<div class="event-times">
			<input type="datetime-local" name="start" id="eventInit.start" required />
			<input type="datetime-local" name="end" id="eventInit.end" required />
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
			{#each calendars.filter(cal => cal.userId == user.id || getCalPermissionsInfo(cal, user).perms.edit) as cal}
				<option value={cal.id}>{cal.name}</option>
			{/each}
		</select>
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
		<input name="location" id="eventInit.location" placeholder="Add location" />
	</div>

	<div>
		<label for="eventInit.description"><Icon i="block-quote" /></label>
		<textarea name="description" id="eventInit.description" placeholder="Add description" {@attach dynamicRows()}></textarea>
	</div>
</FormDialog>

<FormDialog
	id="add-calendar"
	submitText="Create"
	submit={(input: { name: string }) =>
		fetchAPI('PUT', 'users/:id/calendars', input, user.id).then(cal => calendars.push({ ...cal, acl: [], events: [] }))}
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

	.new-event {
		margin: 0.5em;
		background-color: var(--bg-alt);
		text-align: center;
		justify-content: center;
	}

	:global {
		#new-event form {
			width: 25em;

			div:has(label ~ input),
			div:has(label ~ textarea),
			div:has(label ~ select),
			.event-times-container,
			.attendees-container {
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

			h4 {
				margin: 0;
			}
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

			.day-header {
				display: flex;
				text-align: center;
				align-items: center;
				justify-content: center;
				gap: 0.5em;

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
		}
	}
</style>
