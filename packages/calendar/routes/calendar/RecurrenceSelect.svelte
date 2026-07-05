<script lang="ts">
	import type { EventInitProp } from '@axium/calendar/client';
	import { longWeekDay, toByDay, weekDayOfMonth, withOrdinalSuffix } from '@axium/calendar/common';
	import { text } from '@axium/client';
	import type { Entries } from 'utilium';
	import RecurrenceDialog from './RecurrenceDialog.svelte';

	let { eventInit = $bindable() }: { eventInit: EventInitProp } = $props();

	const recurrences = $derived({
		none: '',
		daily: 'FREQ=DAILY',
		weekly: `FREQ=WEEKLY;BYDAY=${toByDay(eventInit.start)}`,
		monthly_by_day: `FREQ=MONTHLY;BYDAY=${Math.ceil(eventInit.start.getDate() / 7) + toByDay(eventInit.start)}`,
		monthly_by_weekday: `FREQ=MONTHLY;BYMONTHDAY=${eventInit.start.getDate()}`,
		yearly: `FREQ=YEARLY;BYMONTH=${eventInit.start.getMonth()};BYMONTHDAY=${eventInit.start.getDate()}`,
	});

	const recurrenceKind = $derived(
		!eventInit.recurrence
			? 'none'
			: (Object.entries(recurrences) as Entries<typeof recurrences>).find(([_, v]) => v === eventInit.recurrence)?.[0] || 'custom'
	);

	let dialog = $state<HTMLDialogElement>();
</script>

<select
	value={recurrenceKind}
	onchange={e => {
		const { value } = e.currentTarget;
		if (value === 'custom') {
			e.currentTarget.value = recurrenceKind; // to prevent "Custom..." being shown when dialog cancelled
			dialog?.showModal();
		} else if (value in recurrences) eventInit.recurrence = recurrences[value as keyof typeof recurrences];
	}}
>
	<option value="none">{text('event_init.recurrence.none')}</option>
	<option value="daily">{text('event_init.recurrence.daily')}</option>
	<option value="weekly">
		{text('event_init.recurrence.weekly', { day: longWeekDay(eventInit.start) })}
	</option>
	<option value="monthly_by_weekday">
		{text('event_init.recurrence.monthly_on', { day: weekDayOfMonth(eventInit.start) })}
	</option>
	<option value="monthly_by_day">
		{text('event_init.recurrence.monthly_on', { day: withOrdinalSuffix(eventInit.start.getDate()) })}
	</option>
	<option value="yearly">
		{text('event_init.recurrence.yearly', {
			date: eventInit.start.toLocaleDateString('default', { month: 'long', day: 'numeric' }),
		})}
	</option>
	<option value="custom">
		{text('event_init.recurrence.custom')}
	</option>
</select>

<RecurrenceDialog bind:dialog bind:eventInit />
