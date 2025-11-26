<script lang="ts">
	import { Icon, NumberBar } from '@axium/client/components';
	import { formatBytes } from '@axium/core/format';
	import { StorageList } from '@axium/storage/components';
	import '@axium/client/styles/list';

	const { data } = $props();
	const { limits } = data.info;

	let items = $state(data.info.items.filter(i => i.type != 'inode/directory').sort((a, b) => Math.sign(b.size - a.size)));
	const usedBytes = $state(data.info.usedBytes);

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
	let barText = $derived(`Using ${formatBytes(usedBytes)} ${limits.user_size ? 'of ' + formatBytes(limits.user_size * 1_000_000) : ''}`);
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

<p><NumberBar max={limits.user_size * 1_000_000} value={usedBytes} text={barText} /></p>

<StorageList bind:items emptyText="You have not uploaded any files yet." />
