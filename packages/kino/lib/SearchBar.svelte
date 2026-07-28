<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { searchMedia } from '@axium/kino/client';
	import type { KinoSearchResults } from '@axium/kino/common';
	import Poster from './Poster.svelte';

	let query = $state(''),
		results = $state<KinoSearchResults>([]),
		open = $state(false),
		pending = $state(false),
		failed = $state(false);

	let debounce: ReturnType<typeof setTimeout> | undefined;

	/** Responses can arrive out of order, so only the newest one is applied */
	let latest = 0;

	function search() {
		clearTimeout(debounce);

		const value = query.trim();

		if (!value) {
			latest++;
			results = [];
			pending = false;
			failed = false;
			open = false;
			return;
		}

		open = true;
		pending = true;
		failed = false;

		debounce = setTimeout(async () => {
			const id = ++latest;
			try {
				const found = await searchMedia(value);
				if (id != latest) return;
				results = found;
			} catch {
				if (id != latest) return;
				results = [];
				failed = true;
			} finally {
				if (id == latest) pending = false;
			}
		}, 300);
	}

	function close() {
		open = false;
	}
</script>

<div
	class="KinoSearch"
	onfocusout={e => {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
	}}
>
	<div class="input icon-text">
		<Icon i="magnifying-glass" />
		<input
			type="search"
			bind:value={query}
			oninput={search}
			onfocus={() => (open = !!query.trim())}
			onkeydown={e => e.key == 'Escape' && close()}
			placeholder={text('kino.search.placeholder')}
			aria-label={text('kino.search.label')}
		/>
	</div>

	{#if open}
		<div class="results">
			{#if pending}
				<i class="subtle message">{text('kino.search.searching')}</i>
			{:else if failed}
				<i class="subtle message">{text('kino.search.failed')}</i>
			{:else}
				{#each results as item (item.type + item.id)}
					{@const title = item.type == 'movie' ? item.title : item.name}
					{@const date = item.type == 'movie' ? item.release_date : item.first_air_date}
					<a class="result" href={item.type == 'movie' ? `/movies/${item.id}` : `/tv/${item.id}`} onclick={close}>
						<Poster path={item.poster_path} type="poster" size="w92" alt={title} />
						<span class="name">{title}</span>
						<span class="subtle meta">
							{text(item.type == 'movie' ? 'kino.search.movie' : 'kino.search.tv')}
							{#if date}· {date.getFullYear()}{/if}
						</span>
					</a>
				{:else}
					<i class="subtle message">{text('kino.search.no_results')}</i>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.KinoSearch {
		position: relative;
		width: min(30em, 100%);
	}

	.input {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.5em 0.75em;
		border-radius: 0.5em;
		background-color: var(--bg-alt);
		border: var(--border-accent);
	}

	input {
		flex: 1 1 auto;
		min-width: 0;
		border: none;
		outline: none;
		background: none;
		color: inherit;
		font: inherit;
	}

	.results {
		position: absolute;
		inset: calc(100% + 0.25em) 0 auto 0;
		z-index: 7;
		max-height: 24em;
		overflow-y: auto;
		border-radius: 0.5em;
		border: var(--border-accent);
		background-color: var(--bg-elevated);
		padding: 0.25em;
	}

	.message {
		display: block;
		padding: 0.75em;
	}

	.result {
		display: grid;
		grid-template-columns: 2.5em 1fr;
		grid-template-rows: auto auto;
		column-gap: 0.75em;
		align-items: center;
		padding: 0.5em;
		border-radius: 0.5em;
		text-decoration: none;
		color: inherit;

		&:hover {
			background-color: var(--bg-strong);
		}

		& :global(.Poster) {
			grid-row: 1 / 3;
		}
	}

	.name {
		align-self: end;
	}

	.meta {
		align-self: start;
		font-size: 0.85em;
	}
</style>
