<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { forMime } from '@axium/core/icons';
	import { FormDialog, Icon, NumberBar } from '@axium/server/components';
	import { deleteItem, updateItemMetadata } from '@axium/storage/client';
	import type { StorageItemUpdate } from '@axium/storage/common';

	const { data } = $props();
	const {
		info: { limits },
		session,
	} = data;

	const items = $state(data.info.items.filter(i => i.type != 'inode/directory').sort((a, b) => Math.sign(b.size - a.size)));
	const usage = $state(data.info.usage);

	let dialogs = $state<Record<string, HTMLDialogElement>>({});
	let barText = $derived(`Using ${formatBytes(usage?.bytes)} of ${formatBytes(limits.user_size * 1_000_000)}`);
</script>

<svelte:head>
	<title>Your Storage Usage</title>
</svelte:head>

{#snippet action(name: string, i: string = 'pen')}
	<button style:display="contents" onclick={() => dialogs[name].showModal()}>
		<Icon {i} --size="16px" />
	</button>
{/snippet}

<div class="flex-content">
	<div class="list main">
		<h2>Storage Usage</h2>

		<p><NumberBar max={limits.user_size * 1_000_000} value={usage?.bytes} text={barText} --fill="#345" /></p>

		{#each items as item}
			<div class="item">
				<Icon i={forMime(item.type)} />
				<p>{item.name}</p>
				<p>{item.type}</p>
				<p>Owned by {item.userId === session?.userId ? 'You' : item.userId}</p>
				<p>{formatBytes(item.size)}</p>
				<p>Uploaded {item.modifiedAt.toLocaleString()}</p>
				<span>{@render action('rename#' + item.id)}</span>
				<span>{@render action('delete#' + item.id, 'trash')}</span>
			</div>
			<FormDialog
				bind:dialog={dialogs['rename#' + item.id]}
				submit={(data: StorageItemUpdate) => updateItemMetadata(item.id, data).then(n => (item.name = n.name))}
				submitText="Update"
			>
				<div>
					<label for="name">Name</label>
					<input name="name" type="text" value={item.name || ''} required />
				</div>
			</FormDialog>
			<FormDialog
				bind:dialog={dialogs['delete#' + item.id]}
				submit={async (data: StorageItemUpdate) => {
					await deleteItem(item.id);
					dialogs['delete#' + item.id].close();
					items.splice(items.indexOf(item), 1);
				}}
				submitText="Delete"
				submitDanger
			>
				<p>
					Are you sure you want to delete this file?<br />
					This action can't be undone.
				</p>
			</FormDialog>
		{/each}
	</div>
</div>

<style>
	.list {
		width: 80%;
		padding-top: 4em;
	}

	.item {
		display: grid;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		border-top: 1px solid #8888;
		padding-bottom: 1em;
		grid-template-columns: 2em 1.5fr 1fr 1fr 5em 1fr 2em 2em;
	}
</style>
