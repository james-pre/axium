<script lang="ts">
	import { withOrdinalSuffix, toByDay, weekDayOfMonth, weekdayInfo } from '@axium/calendar/common';
	import type { EventInitProp } from '@axium/calendar/client';
	import { text } from '@axium/client';
	import { FormDialog } from '@axium/client/components';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		dialog = $bindable(),
		eventInit = $bindable(),
	}: {
		dialog?: HTMLDialogElement;
		eventInit: EventInitProp;
	} = $props();

	let interval = $state(1),
		freq = $state<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('WEEKLY');

	let byWeekday = $state<SvelteSet<number>>(new SvelteSet());
	$effect(() => {
		byWeekday = new SvelteSet([eventInit.start.getDay()]);
	});

	let monthlyMode = $state<'day' | 'weekday'>('day');

	let endType = $state<'never' | 'on' | 'after'>('never'),
		endDate = $state(''),
		endCount = $state(1);

	function buildRRule(): string {
		const parts: string[] = [`FREQ=${freq}`, `INTERVAL=${interval}`];

		if (freq === 'WEEKLY') {
			parts.push(
				`BYDAY=${[...byWeekday]
					.sort()
					.map(i => weekdayInfo[i].rrule)
					.join(',')}`
			);
		} else if (freq === 'MONTHLY') {
			if (monthlyMode === 'weekday') {
				const nth = Math.ceil(eventInit.start.getDate() / 7);
				parts.push(`BYDAY=${nth}${toByDay(eventInit.start)}`);
			} else {
				parts.push(`BYMONTHDAY=${eventInit.start.getDate()}`);
			}
		} else if (freq === 'YEARLY') {
			parts.push(`BYMONTH=${eventInit.start.getMonth() + 1};BYMONTHDAY=${eventInit.start.getDate()}`);
		}

		if (endType === 'on' && endDate) {
			const d = new Date(endDate + 'T00:00:00');
			const pad = (n: number) => String(n).padStart(2, '0');
			parts.push(`UNTIL=${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T000000Z`);
		} else if (endType === 'after') {
			parts.push(`COUNT=${endCount}`);
		}

		return parts.join(';');
	}
</script>

<FormDialog
	bind:dialog
	id="recurrence-custom"
	submitText={text('RecurrenceDialog.confirm')}
	submit={() => (eventInit.recurrence = buildRRule())}
>
	{#snippet header()}
		<h3>{text('RecurrenceDialog.title')}</h3>
	{/snippet}

	<div class="row">
		<span>{text('RecurrenceDialog.repeat_every')}</span>
		<input type="number" min="1" max="999" bind:value={interval} />
		<select bind:value={freq}>
			<option value="DAILY">{text('RecurrenceDialog.freq.day', { n: interval })}</option>
			<option value="WEEKLY">{text('RecurrenceDialog.freq.week', { n: interval })}</option>
			<option value="MONTHLY">{text('RecurrenceDialog.freq.month', { n: interval })}</option>
			<option value="YEARLY">{text('RecurrenceDialog.freq.year', { n: interval })}</option>
		</select>
	</div>

	{#if freq === 'WEEKLY'}
		<div class="on-section">
			<span class="subtle">{text('RecurrenceDialog.on')}</span>
			<div class="weekday-toggles">
				{#each weekdayInfo as { narrow, short }, i}
					<button
						type="button"
						class={['weekday', byWeekday.has(i) && 'active']}
						onclick={() => {
							if (!byWeekday.has(i)) byWeekday.add(i);
							else if (byWeekday.size && i !== eventInit.start.getDay()) byWeekday.delete(i);
						}}
						aria-label={short}
						aria-pressed={byWeekday.has(i)}>{narrow}</button
					>
				{/each}
			</div>
		</div>
	{:else if freq === 'MONTHLY'}
		<div class="on-section">
			<span class="subtle">{text('RecurrenceDialog.on')}</span>
			<div class="monthly-options">
				<label>
					<input type="radio" bind:group={monthlyMode} value="day" />
					{text('RecurrenceDialog.monthly.on_day', { day: withOrdinalSuffix(eventInit.start.getDate()) })}
				</label>
				<label>
					<input type="radio" bind:group={monthlyMode} value="weekday" />
					{text('RecurrenceDialog.monthly.on_weekday', { day: weekDayOfMonth(eventInit.start) })}
				</label>
			</div>
		</div>
	{/if}

	<div class="end-section">
		<span class="subtle">{text('RecurrenceDialog.end.label')}</span>
		<label class="end-row">
			<input type="radio" bind:group={endType} value="never" />
			{text('RecurrenceDialog.end.never')}
		</label>
		<label class="end-row">
			<input type="radio" bind:group={endType} value="on" />
			{text('RecurrenceDialog.end.on')}
			<input type="date" bind:value={endDate} disabled={endType !== 'on'} onclick={() => (endType = 'on')} />
		</label>
		<label class="end-row">
			<input type="radio" bind:group={endType} value="after" />
			{text('RecurrenceDialog.end.after')}
			<input
				type="number"
				min="1"
				max="999"
				bind:value={endCount}
				disabled={endType !== 'after'}
				onclick={() => (endType = 'after')}
			/>
			{text('RecurrenceDialog.end.occurrences')}
		</label>
	</div>
</FormDialog>

<style>
	h3 {
		margin: 0 0 0.25em;
		padding: 0.75em 1em 0;
		font-size: 1.1em;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5em;

		input[type='number'] {
			width: 4em;
		}
	}

	.on-section,
	.end-section {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
	}

	.weekday-toggles {
		display: flex;
		gap: 0.3em;
	}

	.weekday {
		width: 2.25em;
		height: 2.25em;
		border-radius: 50%;
		padding: 0;

		&.active {
			background-color: var(--bg-strong);
			border-color: var(--border-strong);
		}
	}

	.monthly-options {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
	}

	.end-row {
		display: flex;
		align-items: center;
		gap: 0.4em;

		input[type='number'] {
			width: 4em;
		}
	}
</style>
