<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { viewProgress, type KinoSeason, type KinoView } from '@axium/kino/common';
	import ProgressBar from './ProgressBar.svelte';
	import { getSeason } from '../src/client';

	interface Props {
		/** The show the episode belongs to */
		id: number;
		/** The episode to play, or nullish when nothing here has been uploaded */
		view?: (KinoView & { type: 'tv' }) | null;
		/** If viewing a season, this is used */
		season?: KinoSeason;
	}

	const { id, view, season }: Props = $props();

	const episode = $derived(
		view?.episode || (season || (await getSeason(id, 1)))?.episodes?.filter(e => e.episode_number === 1 && e.upload)?.[0]
	);
</script>

{#if episode}
	<a class="WatchButton" href="/tv/{id}/{episode?.season_number ?? 1}/{episode?.episode_number ?? 1}/watch?play">
		<Icon i="play" />

		<span class="info">
			<span>{text(!!view?.position && (!view.duration || view.position < view.duration - 10) ? 'kino.resume' : 'kino.watch')}</span>
			{#if view}
				<span class="subtle episode">
					{season
						? text('kino.episode_number', { number: episode?.episode_number })
						: text('kino.episode_code', { season: episode?.season_number, episode: episode?.episode_number })}
					· {episode?.name}
				</span>
				{const fraction = $derived(viewProgress(view))}
				{#if fraction}
					<ProgressBar value={fraction} />
				{/if}
			{/if}
		</span>
	</a>
{/if}

<style>
	.WatchButton {
		display: inline-flex;
		align-items: center;
		gap: 0.75em;
		max-width: 20em;
		border: var(--border-accent);
		background-color: var(--bg-normal);
		border-radius: 0.5em;
		padding: 0.4em 0.75em;

		&:hover {
			background-color: var(--bg-accent);
		}
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.episode {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
