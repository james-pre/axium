<script lang="ts">
	import type { EventFilter } from '@axium/calendar/common';
	import { Icon } from '@axium/client/components';

	let { start = $bindable(), end = $bindable() }: Required<EventFilter> = $props();

	const today = Temporal.Now.zonedDateTimeISO();

	let view = $state(Temporal.ZonedDateTime.from(start));
	$effect(() => {
		view = Temporal.ZonedDateTime.from(start);
	});

	const firstOfMonth = $derived(view.with({ day: 1 }));
	const firstWeekOfMonth = $derived(firstOfMonth.weekOfYear);
	const sameMonth = (d: Temporal.ZonedDateTimeLike) => !Temporal.PlainYearMonth.compare(view, d);
</script>

<div class="CalendarSelect">
	<div class="bar">
		<span class="label">{view.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
		<button style:display="contents" onclick={() => (view = view.subtract({ months: 1 }))}><Icon i="chevron-left" /></button>
		<button style:display="contents" onclick={() => (view = view.add({ months: 1 }))}><Icon i="chevron-right" /></button>
	</div>

	<div class="month-grid">
		<div></div>
		{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day, i}
			<div class={['d-of-w', sameMonth(today) && today.dayOfWeek == i && 'current']}>{day}</div>
		{/each}

		<div class={['w-of-y', firstWeekOfMonth == today.weekOfYear && 'current']}>{firstWeekOfMonth}</div>

		{#each { length: firstOfMonth.dayOfWeek }}
			<div class="empty"></div>
		{/each}
		{#each { length: view.daysInMonth }, i}
			{@const day = i + 1}
			{@const date = view.with({ day })}
			{#if date.dayOfWeek == 0 && date.weekOfYear != firstWeekOfMonth}
				<div class={['w-of-y', date.weekOfYear == today.weekOfYear && 'current']}>{date.weekOfYear}</div>
			{/if}
			<div
				class={[
					'grid-day',
					sameMonth(today) && day == today.day && 'today',
					sameMonth(start) && day >= start.day && day < end.day && 'selected',
				]}
				onclick={() => {
					start = start.with({ ...view, day: day - date.dayOfWeek });
					end = end.with({ ...view, day: day - date.dayOfWeek + date.daysInWeek });
				}}
			>
				{day}
			</div>
		{/each}
	</div>
</div>

<style>
	.CalendarSelect {
		display: flex;
		flex-direction: column;
	}

	.bar {
		display: grid;
		gap: 1em;
		grid-template-columns: 1fr 1em 1em;
		align-items: center;
		padding-bottom: 1em;
		font-weight: bold;
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(8, 1.5em);
		grid-template-rows: repeat(7, 1.5em);
		gap: 0.25em;

		> div {
			user-select: none;
			padding: 0.25em;
			width: 1.5em;
			height: 1.5em;
			display: inline-flex;
			text-align: center;
			align-items: center;
			justify-content: center;
		}

		.grid-day {
			border-radius: 0.25em;

			&:hover {
				background-color: var(--bg-accent);
			}

			&.today {
				border: var(--border-accent);
			}

			&.selected {
				color: var(--fg-accent);
			}
		}

		.d-of-w,
		.w-of-y {
			font-weight: bold;
			&.current {
				color: var(--fg-strong);
			}
		}
	}

	@media (width < 700px) {
		.CalendarSelect {
			width: 100%;
		}

		.month-grid {
			width: 100%;
			grid-template-columns: repeat(8, minmax(0, 1fr));
			grid-template-rows: repeat(7, minmax(0, 1fr));
		}

		.month-grid > div {
			width: 100%;
			aspect-ratio: 1;
			height: auto;
			min-width: 0;
		}
	}
</style>
