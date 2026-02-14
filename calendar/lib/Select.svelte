<script lang="ts">
	import { weekOfYear, type EventFilter } from '@axium/calendar/common';
	import { Icon } from '@axium/client/components';
	import { SvelteDate } from 'svelte/reactivity';

	let { start = $bindable(), end = $bindable() }: Required<EventFilter> = $props();

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	let view = new SvelteDate(start);
	$effect(() => {
		view.setTime(start.getTime());
	});

	const firstOfMonth = $derived(new Date(view.getFullYear(), view.getMonth(), 1));
	const firstWeekOfMonth = $derived(weekOfYear(firstOfMonth, true));
	const lastOfMonth = $derived(new Date(view.getFullYear(), view.getMonth() + 1, 0));
	const sameMonth = (d: Date) => view.getFullYear() == d.getFullYear() && view.getMonth() == d.getMonth();
</script>

<div class="CaldendarSelect">
	<div class="bar">
		<span class="label">{view.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
		<button style:display="contents" onclick={() => view.setMonth(view.getMonth() - 1)}><Icon i="chevron-left" /></button>
		<button style:display="contents" onclick={() => view.setMonth(view.getMonth() + 1)}><Icon i="chevron-right" /></button>
	</div>

	<div class="month-grid">
		<div></div>
		{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day, i}
			<div class={['d-of-w', sameMonth(today) && today.getDay() == i && 'current']}>{day}</div>
		{/each}

		<div class={['w-of-y', firstWeekOfMonth == weekOfYear(today, true) && 'current']}>{firstWeekOfMonth}</div>

		{#each { length: firstOfMonth.getDay() }}
			<div class="empty"></div>
		{/each}
		{#each { length: lastOfMonth.getDate() }, i}
			{@const day = i + 1}
			{@const year = view.getFullYear()}
			{@const month = view.getMonth()}
			{@const date = new Date(year, month, day)}
			{#if date.getDay() == 0 && weekOfYear(date, true) != firstWeekOfMonth}
				<div class={['w-of-y', weekOfYear(date, true) == weekOfYear(today, true) && 'current']}>{weekOfYear(date, true)}</div>
			{/if}
			<div
				class={[
					'grid-day',
					sameMonth(today) && day == today.getDate() && 'today',
					sameMonth(start) && day >= start.getDate() && day <= end.getDate() && 'selected',
				]}
				onclick={() => {
					start.setFullYear(year);
					start.setMonth(month);
					start.setDate(day - date.getDay());
					end.setFullYear(year);
					end.setMonth(month);
					end.setDate(day - date.getDay() + 6);
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
		align-items: center;
		justify-content: space-between;
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
				color: var(--fg-accent);
				border-color: var(--border-accent);
			}
		}

		.d-of-w,
		.w-of-y {
			font-weight: bold;
			&.current {
				color: var(--fg-accent);
			}
		}
	}
</style>
