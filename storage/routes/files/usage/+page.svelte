<script lang="ts">
	import { text } from '@axium/client';
	import { NumberBar } from '@axium/client/components';
	import { formatBytes } from '@axium/core/format';
	import { List } from '@axium/storage/components';

	const { data } = $props();
	const { limits } = data.info;

	let items = $state(data.info.items.filter(i => i.type != 'inode/directory'));
	const usedBytes = $state(data.info.usedBytes);

	let barText = $derived(
		limits.user_size
			? text('page.files.usage.bar_text', { used: formatBytes(usedBytes), total: formatBytes(limits.user_size * 1_000_000) })
			: text('page.files.usage.bar_text_unlimited', { used: formatBytes(usedBytes) })
	);
</script>

<svelte:head>
	<title>{text('page.files.usage.title')}</title>
</svelte:head>

<h2>{text('page.files.usage.heading')}</h2>

<p><NumberBar max={limits.user_size * 1_000_000} value={usedBytes} text={barText} /></p>

<List bind:items emptyText={text('page.files.usage.empty')} user={data.session?.user} />
