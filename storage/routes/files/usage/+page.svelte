<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime } from '@axium/core/icons';
	import { FormDialog, Icon, NumberBar } from '@axium/client/components';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import type { StorageItemUpdate } from '@axium/storage/common';
	import { StorageList } from '@axium/storage/components';
	import '@axium/storage/styles/list';

	const { data } = $props();
	const { limits } = data.info;

	let items = $state(data.info.items.filter(i => i.type != 'inode/directory').sort((a, b) => Math.sign(b.size - a.size)));
	const usage = $state(data.info.usage);

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
	let barText = $derived(`Using ${formatBytes(usage?.bytes)} of ${formatBytes(limits.user_size * 1_000_000)}`);
</script>

<svelte:head>
	<title>Your Storage Usage</title>
</svelte:head>

{#snippet action(name: string, i: string = 'pen')}
	<span class="action" onclick={() => dialogs[name].showModal()}>
		<Icon {i} --size="16px" />
	</span>
{/snippet}

<h2>Storage Usage</h2>

<p><NumberBar max={limits.user_size * 1_000_000} value={usage?.bytes} text={barText} /></p>

<StorageList bind:items emptyText="You have not uploaded any files yet." />
