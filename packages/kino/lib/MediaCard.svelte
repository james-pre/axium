<script lang="ts">
	import type { KinoSearchResults } from '@axium/kino/common';
	import Poster from './Poster.svelte';

	const { item }: { item: KinoSearchResults[number] } = $props();

	const href = $derived(item.type == 'movie' ? `/movies/${item.id}` : `/tv/${item.id}`);
	const title = $derived(item.type == 'movie' ? item.title : item.name);
	const date = $derived(item.type == 'movie' ? item.release_date : item.first_air_date);
</script>

<a class="MediaCard" {href}>
	<Poster path={item.poster_path} type="poster" size="w342" alt={title} />
	<span class="title">{title}</span>
	{#if date}
		<span class="subtle year">{date.getFullYear()}</span>
	{/if}
</a>

<style>
	.MediaCard {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		text-decoration: none;
		color: inherit;

		&:hover .title {
			color: var(--fg-strong);
		}
	}

	.title {
		text-wrap: balance;
		line-height: 1.2;
	}

	.year {
		font-size: 0.85em;
	}
</style>
