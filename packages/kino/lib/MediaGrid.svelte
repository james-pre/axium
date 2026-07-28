<script lang="ts">
	import type { KinoSearchResults } from '@axium/kino/common';
	import MediaCard from './MediaCard.svelte';

	const { items, empty }: { items: KinoSearchResults; empty: string } = $props();
</script>

<div class="MediaGrid">
	{#each items as item (item.type + item.id)}
		<MediaCard {item} />
	{:else}
		<p class="subtle">{empty}</p>
	{/each}
</div>

<style>
	.MediaGrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9em, 1fr));
		gap: 1em;
		align-items: start;

		&:has(> p) {
			display: block;
		}
	}
</style>
