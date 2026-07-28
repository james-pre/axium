<script lang="ts">
	import { Icon } from '@axium/client/components';
	import { imageURL } from '@axium/kino/client';
	import type { ImageSize, ImageType } from '@axium/kino/common';

	const { path, type = 'poster', size, alt = '' }: { path?: string | null; type?: ImageType; size?: ImageSize; alt?: string } = $props();

	const src = $derived(imageURL(path, type, size));
</script>

{#if src}
	<img class="Poster {type}" {src} {alt} loading="lazy" />
{:else}
	<div class="Poster placeholder {type}">
		<Icon i={type == 'poster' ? 'film' : 'photo-film'} --size="2em" />
	</div>
{/if}

<style>
	.Poster {
		display: block;
		width: 100%;
		border-radius: 0.5em;
		background-color: var(--bg-alt);
		object-fit: cover;
	}

	.poster {
		aspect-ratio: 2 / 3;
	}

	.still,
	.backdrop {
		aspect-ratio: 16 / 9;
	}

	.logo,
	.profile {
		aspect-ratio: 1;
		object-fit: contain;
	}

	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		--fill: var(--fg-disabled);
	}
</style>
