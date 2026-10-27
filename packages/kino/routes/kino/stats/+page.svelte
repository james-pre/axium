<script lang="ts">
	import { text } from '@axium/client';
	import { Boundary, NumberBar } from '@axium/client/components';
	import { Poster } from '@axium/kino/components';
	import { bytes } from 'utilium/format';

	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.kino.stats.title')}</title>
</svelte:head>

<h1>{text('page.kino.stats.heading')}</h1>

<Boundary error="page.kino.stats.failed" inline>
	{const { counts, size, images, disk, downloads, watched, largest } = await data.stats}
	{const librarySize = size.movies + size.tv}

	<div class="counts">
		<div class="count">
			<span class="number">{counts.movies}</span>
			<span class="subtle">{text('page.kino.stats.movies')}</span>
		</div>
		<div class="count">
			<span class="number">{counts.shows}</span>
			<span class="subtle">{text('page.kino.stats.shows')}</span>
		</div>
		<div class="count">
			<span class="number">{counts.episodes}</span>
			<span class="subtle">{text('page.kino.stats.episodes')}</span>
		</div>
	</div>

	<section>
		<h2>{text('page.kino.stats.storage')}</h2>

		{#if disk}
			<NumberBar
				max={disk.size}
				value={disk.size - disk.free}
				text={text('page.kino.stats.disk', { used: bytes(disk.size - disk.free), free: bytes(disk.free), size: bytes(disk.size) })}
			/>
		{/if}

		<dl>
			<dt>{text('page.kino.stats.library')}</dt>
			<dd>{bytes(librarySize)}</dd>
			<dt>{text('page.kino.stats.movies')}</dt>
			<dd>{bytes(size.movies)}</dd>
			<dt>{text('page.kino.stats.shows')}</dt>
			<dd>{bytes(size.tv)}</dd>
			<dt>{text('page.kino.stats.image_cache')}</dt>
			<dd>
				{images.limit === null
					? bytes(images.size)
					: text('page.kino.stats.of_limit', { size: bytes(images.size), limit: bytes(images.limit) })}
			</dd>
		</dl>
	</section>

	{#if downloads}
		<section>
			<h2>{text('page.kino.stats.downloads')}</h2>
			<dl>
				<dt>{text('page.kino.stats.downloading')}</dt>
				<dd>{downloads.active}</dd>
				<dt>{text('page.kino.stats.seeding')}</dt>
				<dd>{downloads.seeding}</dd>
			</dl>
		</section>
	{/if}

	<section>
		<h2>{text('page.kino.stats.watched')}</h2>
		<dl>
			<dt>{text('page.kino.stats.movies')}</dt>
			<dd>{watched.movies}</dd>
			<dt>{text('page.kino.stats.episodes')}</dt>
			<dd>{watched.episodes}</dd>
		</dl>
	</section>

	<section>
		<h2>{text('page.kino.stats.largest')}</h2>
		{#each largest as item (item.type + item.id)}
			<a class="largest" href={item.type == 'movie' ? `/movies/${item.id}` : `/tv/${item.id}`}>
				<Poster path={item.poster_path} type="poster" size="w92" alt={item.name} />
				<span class="name">{item.name}</span>
				<span class="subtle">{text(item.type == 'movie' ? 'kino.search.movie' : 'kino.search.tv')}</span>
				<span class="size">{bytes(item.size)}</span>
			</a>
		{:else}
			<p class="subtle">{text('page.kino.stats.empty')}</p>
		{/each}
	</section>
</Boundary>

<style>
	h1 {
		margin: 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
		max-width: 40em;
	}

	h2 {
		margin: 0;
		font-size: 1.15em;
	}

	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
	}

	.count {
		display: flex;
		flex-direction: column;
		min-width: 8em;
		padding: 0.75em 1em;
		border-radius: 0.5em;
		background-color: var(--bg-alt);
	}

	.number {
		font-size: 2em;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
	}

	dl {
		display: grid;
		grid-template-columns: max-content max-content;
		gap: 0.5em 2em;
		margin: 0;
	}

	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.largest {
		display: grid;
		grid-template-columns: 2.5em 1fr auto;
		grid-template-rows: auto auto;
		column-gap: 0.75em;
		align-items: center;
		padding: 0.25em;
		border-radius: 0.5em;
		text-decoration: none;
		color: inherit;

		&:hover {
			background-color: var(--bg-alt);
		}

		& :global(.Poster) {
			grid-row: 1 / 3;
		}

		.name {
			align-self: end;
		}

		.subtle {
			align-self: start;
			font-size: 0.85em;
		}

		.size {
			grid-row: 1 / 3;
			grid-column: 3;
			font-variant-numeric: tabular-nums;
		}
	}
</style>
