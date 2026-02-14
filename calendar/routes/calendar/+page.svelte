<script lang="ts">
	import * as Calendar from '@axium/calendar/components';
	import { getCalPermissionsInfo, type EventFilter } from '@axium/calendar/common';
	import Icon from '@axium/client/components/Icon';
	const { data } = $props();

	const { user } = data.session;

	let selection = $state<EventFilter>(data.filter);
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div id="cal-app">
	<div id="cal-list">
		<Calendar.Select bind:start={selection.start} bind:end={selection.end} />
		<div class="cal-list-header">
			<h4>Your Calendars</h4>
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
	<div id="cal"></div>
</div>

<style>
	#cal-app {
		display: grid;
		grid-template-columns: 15em 1fr;
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
</style>
