<script lang="ts">
	import { text } from '@axium/client';
	import { NumberBar } from '@axium/client/components';
	import { bytes as formatBytes } from 'utilium/format';
	import { List } from '@axium/storage/components';

	const { data } = $props();
	const { fileCount, usedBytes, limits } = data.info;
	let items = $state(data.info.items);

	let barText = $derived(
		limits.user_size
			? text('page.files.usage.bar_text', { used: formatBytes(usedBytes), total: formatBytes(limits.user_size * 1_000_000n) })
			: text('page.files.usage.bar_text_unlimited', { used: formatBytes(usedBytes) })
	);
</script>

<svelte:head>
	<title>{text('page.files.usage.title')}</title>
</svelte:head>

<h2>{text('page.files.usage.heading')}</h2>

<div class="usage-bar">
	<NumberBar max={Number(limits.user_size * 1_000_000n)} value={Number(usedBytes)} text={barText} />
</div>

<List bind:items emptyText={text('page.files.usage.empty')} user={data.session?.user} sort={{ by: 'size', descending: true }} special />

{#if fileCount > items.length}
	<p>{text('page.files.usage.more_files', { count: fileCount - items.length })}</p>
{/if}

<style>
	.usage-bar {
		padding: 0.5em 0;

		@media (width >= 700px) {
			position: sticky;
			top: 0;
			z-index: 2;
			background-color: var(--bg-menu);

			+ :global(.list > .list-header) {
				top: calc(var(--height, 2em) + 1em);
			}
		}
	}
</style>
