<script lang="ts">
	import { text } from '@axium/client';
	import { getAddOptions, getMovie, getTv } from '@axium/kino/client';
	import type { KinoDownload, KinoDownloadTarget, KinoSearchResults } from '@axium/kino/common';
	import * as io from 'ioium';
	import { SvelteMap } from 'svelte/reactivity';
	import { downloads, watchDownloads } from '@axium/kino/downloads';
	import { Poster, ProgressBar } from '@axium/kino/components';

	type Media = KinoSearchResults[number];

	interface Entry {
		media: Media;
		download?: KinoDownload;
	}

	/** Recently searched media, most recent first. Media being downloaded is pinned ahead of it. */
	const { items }: { items: KinoSearchResults } = $props();

	if ((await getAddOptions()).downloads) void watchDownloads();

	function mediaKey(media: Media): string {
		return `${media.type}:${media.id}`;
	}

	function targetKey(target: KinoDownloadTarget): string {
		return `${target.type == 'movie' ? 'movie' : 'tv'}:${target.id}`;
	}

	const searched = $derived(new Map(items.map(item => [mediaKey(item), item])));

	/** Seeded downloads are already in the library */
	const pinned = $derived(
		downloads
			.values()
			.filter(download => download.state != 'seeding')
			.toArray()
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
	);

	/** Media for downloads that weren't searched for recently */
	const fetched = new SvelteMap<string, Media>();
	const requested = new Set<string>();

	$effect(() => {
		for (const { target } of pinned) {
			const key = targetKey(target);
			if (searched.has(key) || requested.has(key)) continue;
			requested.add(key);

			const media: Promise<Media> =
				target.type == 'movie'
					? getMovie(target.id).then(movie => ({ ...movie, type: 'movie' }))
					: getTv(target.id).then(show => ({ ...show, type: 'tv' }));

			media.then(
				loaded => fetched.set(key, loaded),
				error => io.debug('Kino: could not load a download’s metadata: ' + io.errorText(error))
			);
		}
	});

	const entries = $derived.by(() => {
		const list: Entry[] = [];
		const downloading = new Set<string>();

		for (const download of pinned) {
			const key = targetKey(download.target);
			const media = searched.get(key) ?? fetched.get(key);
			if (!media) continue;
			downloading.add(key);
			list.push({ media, download });
		}

		for (const item of items) {
			if (!downloading.has(mediaKey(item))) list.push({ media: item });
		}

		return list;
	});

	function href({ media, download }: Entry): string {
		if (media.type == 'movie') return `/movies/${media.id}`;
		const target = download?.target;
		if (target?.type == 'season') return `/tv/${media.id}/${target.season}`;
		if (target?.type == 'episode') return `/tv/${media.id}/${target.season}/${target.episode}`;
		return `/tv/${media.id}`;
	}

	function targetLabel(target: KinoDownloadTarget): string | undefined {
		if (target.type == 'season') return text('kino.season', { number: target.season });
		if (target.type == 'episode') return text('kino.episode_code', { season: target.season, episode: target.episode });
	}
</script>

{#if entries.length}
	<section class="RecentSearches">
		<h2>{text('page.kino.recently_searched')}</h2>

		<div class="grid">
			{#each entries as entry (entry.download?.hash ?? mediaKey(entry.media))}
				{const { media, download } = entry}
				{const title = media.type == 'movie' ? media.title : media.name}
				<a class="item" href={href(entry)}>
					<Poster path={media.poster_path} type="poster" size="w342" alt={title} />

					{#if download && download.state != 'failed'}
						<ProgressBar value={download.state == 'downloading' ? download.progress : null} />
					{/if}

					<span class="title">{title}</span>

					{#if download}
						{const label = targetLabel(download.target)}
						<span class={['subtle', 'detail', download.state == 'failed' && 'error']}>
							{#if label}{label} ·{/if}
							{text(`kino.torrent.state.${download.state}`)}
						</span>
					{:else}
						{const date = media.type == 'movie' ? media.release_date : media.first_air_date}
						{#if date}
							<span class="subtle detail">{date.getFullYear()}</span>
						{/if}
					{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.RecentSearches {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
	}

	h2 {
		margin: 0;
		font-size: 1.15em;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9em, 1fr));
		gap: 1em;
		align-items: start;
	}

	.item {
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

	.detail {
		font-size: 0.85em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error {
		color: var(--fg-error);
	}
</style>
