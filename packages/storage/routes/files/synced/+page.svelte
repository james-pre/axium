<script lang="ts">
	import { goto } from '$app/navigation';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import type { StorageSyncInfo } from '@axium/storage/common';
	import * as format from 'utilium/format';
	import SyncSettings from './SyncSettings.svelte';

	const { data } = $props();
	let syncs = $state(data.syncs);
	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	function lastSynced(sync: StorageSyncInfo) {
		return sync.devices.filter(device => device.lastSynced).sort((a, b) => b.lastSynced!.getTime() - a.lastSynced!.getTime())[0];
	}
</script>

<svelte:head>
	<title>{text('page.files.synced.title')}</title>
</svelte:head>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>{text('page.files.synced.name')}</span>
		<span>{text('page.files.synced.last_synced')}</span>
		<span>{text('page.files.synced.size')}</span>
		<span></span>
	</div>
	{#each syncs as sync (sync.itemId)}
		{const latest = lastSynced(sync)}
		<div class={['list-item', sync.item.trashedAt && 'dimmed']} onclick={() => dialogs[sync.itemId].showModal()}>
			<Icon i="folder" />
			<span class="name">
				{sync.item.name}
				{#if sync.hidden}
					<span class="hidden" title={text('page.files.synced.hidden')}><Icon i="eye-slash" --size="12px" /></span>
				{/if}
				{#if sync.item.trashedAt}
					<span class="hidden" title={text('page.files.synced.trashed')}><Icon i="trash" --size="12px" /></span>
				{/if}
			</span>
			<span class="last-synced mobile-subtle">
				{#if latest}
					<span class="mobile-hide">
						{text('page.files.synced.device_summary', { host: latest.host, time: format.dateRange(latest.lastSynced!) })}
					</span>
					<span class="mobile-only">
						{text('page.files.synced.device_summary', { host: latest.host, time: format.relativeToDate(latest.lastSynced!) })}
					</span>
				{:else}
					{text('page.files.synced.never')}
				{/if}
			</span>
			<span class="usage mobile-subtle">
				{text('page.files.synced.usage', { size: format.bytes(sync.usage.size), count: sync.usage.items })}
			</span>
			<span
				class="icon-text action"
				title={text('page.files.synced.open')}
				onclick={e => {
					e.stopPropagation();
					goto('/files/' + sync.itemId);
				}}
			>
				<Icon i="arrow-up-right-from-square" --size="14px" />
			</span>
		</div>
	{:else}
		<p class="list-empty">{text('page.files.synced.empty')}</p>
	{/each}
</div>

{#each syncs as sync, i (sync.itemId)}
	<SyncSettings bind:sync={syncs[i]} bind:dialog={dialogs[sync.itemId]} />
{/each}

<style>
	.list-item {
		grid-template-columns: 1em 3fr 2fr 1fr 1em;
	}

	.name,
	.last-synced {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hidden {
		margin-left: 0.5em;
		opacity: 0.6;
	}

	@media (width < 700px) {
		.list-item {
			grid-template-columns: 1em 1fr 1fr 1em;
			row-gap: 0.25em;

			.name {
				grid-column: 2 / 4;
			}

			.last-synced {
				grid-row: 2;
				grid-column: 2;
			}

			.usage {
				grid-row: 2;
				grid-column: 3;
				text-align: right;
			}

			.action {
				grid-row: 1;
				grid-column: 4;
				visibility: visible;
			}
		}
	}
</style>
