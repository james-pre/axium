<script lang="ts">
	import * as Calendar from '@axium/calendar/components';
	import { getCalPermissionsInfo, type EventFilter } from '@axium/calendar/common';
	import Icon from '@axium/client/components/Icon';
	const { data } = $props();

	const { user } = data.session;

	let selection = $state<EventFilter>(data.filter);

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
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div id="cal-app">
	<div id="cal-list">
		<Calendar.Select bind:start={selection.start} bind:end={selection.end} />
		<div class="cal-list-header">
			<h4>My Calendars</h4>
			<button style:display="contents">
				<Icon i="plus" />
			</button>
		</div>
		{#each data.calendars.filter(cal => cal.userId == user.id) as cal}
			<span>{cal.name}</span>
		{/each}
		{#if data.calendars.some(cal => cal.userId != user.id)}
			<div class="cal-list-header">
				<h4>Shared Calendars</h4>
			</div>
			{#each data.calendars.filter(cal => cal.userId != user.id) as cal}
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
			<span class="hour"></span>
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

<style>
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

		.cal-list-header {
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
			align-items: center;
			text-align: right;
			justify-content: space-around;
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
