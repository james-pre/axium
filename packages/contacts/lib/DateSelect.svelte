<script lang="ts">
	import { dateField } from '@axium/client';
	import * as locales from '@james-pre/locales';

	let { day = $bindable<number>(), month = $bindable<number>(), year = $bindable<number>() } = $props();
</script>

<div class="ContactDateSelect">
	<select bind:value={month}>
		<option value="" disabled selected>{dateField('month')}</option>
		{#each locales.monthNames as month, i}
			<option value={i + 1}>{month}</option>
		{/each}
	</select>

	<input type="number" bind:value={day} min="1" max="31" size="3" placeholder={dateField('day')} />
	<input type="number" bind:value={year} min="0" max="9999" size="4" placeholder={dateField('year')} />
</div>

<style>
	.ContactDateSelect {
		display: flex;
		gap: 0.5em;
		align-items: center;
	}
</style>
