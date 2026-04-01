<script lang="ts">
	import { countryName, text } from '@axium/client';
	import { countries, type LocationInit } from '@axium/core';

	let { value = $bindable<LocationInit>() }: { value: LocationInit } = $props();
</script>

<select bind:value={value.country} placeholder={text('location.country')}>
	{#each countries as country}
		<option value={country}>{countryName(country)}</option>
	{/each}
</select>

<input type="text" placeholder={text('location.street1')} bind:value={value.street1} />
<input type="text" placeholder={text('location.street2')} bind:value={value.street2} />
<input type="text" placeholder={text('location.locality')} bind:value={value.locality} />
<div>
	<input type="text" placeholder={text('location.subdivision')} bind:value={value.subdivision} />
	<input type="text" placeholder={text('location.postal_code')} bind:value={value.postalCode} />
</div>
