<script lang="ts">
	import { NumberBar } from '@axium/client/components';
	import '@axium/client/styles/list';
	import { formatBytes } from '@axium/core/format';
	import { List } from '@axium/storage/components';

	const { data } = $props();
	const { limits } = data.info;

	let items = $state(data.info.items.filter(i => i.type != 'inode/directory').sort((a, b) => Math.sign(b.size - a.size)));
	const usedBytes = $state(data.info.usedBytes);

	let barText = $derived(`Using ${formatBytes(usedBytes)} ${limits.user_size ? 'of ' + formatBytes(limits.user_size * 1_000_000) : ''}`);
</script>

<svelte:head>
	<title>Your Storage Usage</title>
</svelte:head>

<h2>Storage Usage</h2>

<p><NumberBar max={limits.user_size * 1_000_000} value={usedBytes} text={barText} /></p>

<List bind:items emptyText="You have not uploaded any files yet." user={data.session?.user} />
