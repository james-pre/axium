<script lang="ts">
	import * as Calendar from '@axium/calendar/components';
	import { getCalPermissionsInfo, type EventFilter } from '@axium/calendar/common';
	import { Icon, FormDialog, Popover, AccessControlDialog } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	const { data } = $props();

	const { user } = data.session;

	let selection = $state<EventFilter>(data.filter);
	let calendars = $state(data.calendars);

	const tz = new Date().toLocaleString('en', { timeStyle: 'long' }).split(' ').slice(-1)[0];

	const span = 'week';
	const weekDays = $derived.by(function* () {
		const start = new Date(selection.start);
		start.setDate(start.getDate() - start.getDay());
		yield start;
		for (let i = 1; i < 7; i++) {
			yield new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		}
	});

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div id="cal-app">
	<div id="cal-list">
		<Calendar.Select bind:start={selection.start} bind:end={selection.end} />
		<div class="cal-list-header">
			<h4>My Calendars</h4>
			<button style:display="contents" command="show-modal" commandfor="add-calendar">
				<Icon i="plus" />
			</button>
		</div>
		{#each calendars.filter(cal => cal.userId == user.id) as cal (cal.id)}
			<div class="cal-list-item">
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
							<span>{day.getDate()}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

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
		top: 4em;
	}

	#cal-app {
		display: grid;
		grid-template-columns: 15em 1fr;
		inset: 0;
		position: absolute;
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
		padding-left: 1em;

		.hours {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			text-align: right;
			justify-content: space-around;
			overflow-x: visible;
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
				gap: 1em;
			}
		}
	}
</style>
