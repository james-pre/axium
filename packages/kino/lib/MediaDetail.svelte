<script lang="ts">
	import { text } from '@axium/client';
	import { imageURL } from '@axium/kino/client';
	import type { ImageType } from '@axium/kino/common';
	import type { Snippet } from 'svelte';
	import Poster from './Poster.svelte';

	interface Props {
		title: string;
		/** Shown above the title, e.g. the show a season belongs to */
		context?: Snippet;
		/** The artwork shown beside the title */
		imagePath?: string | null;
		imageType?: ImageType;
		backdropPath?: string | null;
		date?: Date | null;
		/** Whether the date is a release date (movies) or an air date (TV) */
		dateKind?: 'released' | 'aired';
		overview?: string | null;
		/** Watch/download/upload buttons */
		actions?: Snippet;
		/** Anything below the header, e.g. a season or episode list */
		children?: Snippet;
	}

	const {
		title,
		context,
		imagePath,
		imageType = 'poster',
		backdropPath,
		date,
		dateKind = 'released',
		overview,
		actions,
		children,
	}: Props = $props();

	const backdrop = $derived(imageURL(backdropPath, 'backdrop', 'w1280'));
</script>

<div class="MediaDetail">
	<div class="header">
		{#if backdrop}
			<div class="backdrop" style:background-image="url('{backdrop}')"></div>
		{/if}

		<div class="art"><Poster path={imagePath} type={imageType} size="w342" alt={title} /></div>

		<div class="info">
			{#if context}<span class="subtle">{@render context()}</span>{/if}
			<h1>{title}</h1>
			<span class="subtle">
				{date
					? text(dateKind == 'aired' ? 'kino.aired' : 'kino.released', { date: date.toLocaleDateString() })
					: text('kino.unreleased')}
			</span>

			{#if actions}<div class="actions">{@render actions()}</div>{/if}

			<h2>{text('kino.overview')}</h2>
			<p class="overview">{overview || text('kino.no_overview')}</p>
		</div>
	</div>

	{#if children}{@render children()}{/if}
</div>

<style>
	.MediaDetail {
		display: flex;
		flex-direction: column;
		gap: 2em;
	}

	.header {
		position: relative;
		display: grid;
		grid-template-columns: 14em 1fr;
		gap: 2em;
		padding: 1.5em;
		border-radius: 1em;
		overflow: hidden;
		isolation: isolate;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		z-index: -1;
		background-size: cover;
		background-position: center;
		opacity: 0.25;
		/* Keep the text readable over busy artwork */
		mask-image: linear-gradient(to right, transparent, black 40%);
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		min-width: 0;
	}

	h1 {
		margin: 0;
		text-wrap: balance;
	}

	h2 {
		margin: 0.5em 0 0;
		font-size: 1.05em;
	}

	.overview {
		margin: 0;
		max-width: 60ch;
		text-wrap: pretty;
	}

	.actions {
		margin-top: 0.5em;
	}

	@media (width < 700px) {
		.header {
			grid-template-columns: 1fr;
			gap: 1em;
			padding: 1em;
		}

		.art {
			width: 10em;
		}

		.backdrop {
			mask-image: linear-gradient(to bottom, transparent, black 60%);
		}
	}
</style>
