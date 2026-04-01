<script lang="ts">
	import { text, countryNames } from '@axium/client';
	import type { LocationInit } from '@axium/core';

	let { value = $bindable<LocationInit>() }: { value: LocationInit } = $props();
</script>

<select bind:value={value.country} placeholder={text('location.country')}>
	{#each Object.entries(countryNames) as [code, name]}
		<option value={code}>{name}</option>
	{/each}
</select>

<input type="text" placeholder={text('location.street1')} bind:value={value.street1} />
<input type="text" placeholder={text('location.street2')} bind:value={value.street2} />
<input type="text" placeholder={text('location.locality')} bind:value={value.locality} />
<div>
	<input type="text" placeholder={text('location.subdivision')} bind:value={value.subdivision} />
	<input type="text" placeholder={text('location.postal_code')} bind:value={value.postalCode} />
</div>
