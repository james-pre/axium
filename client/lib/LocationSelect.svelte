<script lang="ts">
	import { text } from '@axium/client';
	import type { LocationInit } from '@axium/core';
	import { getNames } from 'i18n-iso-countries';

	let {
		value = $bindable<LocationInit>(),
		locale = 'en',
	}: {
		value: LocationInit;
		locale: string;
	} = $props();

	const countries = getNames(locale);
</script>

<select bind:value={value.country} placeholder={text('LocationSelect.country')}>
	{#each Object.entries(countries) as [code, name]}
		<option value={code}>{name}</option>
	{/each}
</select>

<input type="text" placeholder={text('LocationSelect.street1')} bind:value={value.street1} />
<input type="text" placeholder={text('LocationSelect.street2')} bind:value={value.street2} />
<input type="text" placeholder={text('LocationSelect.locality')} bind:value={value.locality} />
<div>
	<input type="text" placeholder={text('LocationSelect.subdivision')} bind:value={value.subdivision} />
	<input type="text" placeholder={text('LocationSelect.postalCode')} bind:value={value.postalCode} />
</div>
