<script lang="ts">
	import { text } from '@axium/client';
	import { contextMenu, type ContextMenuItem } from '@axium/client/attachments';
	import { AccessControlDialog, Icon, InlineEdit, Popover } from '@axium/client/components';
	import { toastStatus } from '@axium/client/toast';
	import { checkAndMatchACL, type UserPublic } from '@axium/core';
	import { formatOf, icons } from '@axium/office/common';
	import { updateItemMetadata } from '@axium/storage/client';
	import { _downloadItem } from '@axium/storage/client/frontend';
	import type { StorageItemMetadata } from '@axium/storage/common';

	let {
		item = $bindable(),
		user,
		ontrash,
	}: {
		item: StorageItemMetadata;
		user: UserPublic;
		ontrash(): void;
	} = $props();

	const href = $derived(`/office/${item.id}`);
	const format = $derived(formatOf(item));
	const isShared = $derived(item.userId != user.id);
	const canManage = $derived(!isShared || (!!item.acl && !checkAndMatchACL(item.acl, user, { manage: true }).size));

	let renaming = $state(false),
		sharing = $state(false),
		shareDialog = $state<HTMLDialogElement>();

	$effect(() => shareDialog?.showModal());

	function rename(name: string) {
		toastStatus(
			updateItemMetadata(item.id, { name }).then(() => (item.name = name)),
			text('office.renamed')
		);
	}

	function trash() {
		toastStatus(updateItemMetadata(item.id, { trash: true }).then(ontrash), text('office.trashed'));
	}

	const entries = $derived<(ContextMenuItem | false)[]>([
		{ i: 'arrow-up-right-from-square', text: text('office.open_new_tab'), action: () => open(href) },
		canManage && { i: 'pencil', text: text('generic.rename'), action: () => (renaming = true) },
		{ i: 'download', text: text('office.download'), action: () => _downloadItem(item) },
		canManage && { i: 'user-group', text: text('generic.share'), action: () => (sharing = true) },
		canManage && { i: 'trash', text: text('office.trash'), action: trash, danger: true },
	]);

	const actions = $derived(entries.filter(entry => entry !== false));
</script>

{#snippet details()}
	<Icon i={icons[format?.kind ?? 'document']} --size="2em" />
	{#if renaming}
		{const dot = $derived(item.name.lastIndexOf('.'))}
		<span class="name editing">
			<InlineEdit
				value={item.name}
				selectionRange={[0, dot > 0 ? dot : item.name.length]}
				confirmLabel={text('generic.rename')}
				commit={rename}
				close={() => (renaming = false)}
			/>
		</span>
	{:else}
		<span class="name" title={item.name}>{item.name}</span>
	{/if}
	<span class="subtle">
		{isShared
			? text('office.shared')
			: text('office.modified', { date: item.modifiedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) })}
	</span>
{/snippet}

<div class="DocumentCard" {@attach contextMenu(() => entries)}>
	{#if renaming}
		<div class="details">{@render details()}</div>
	{:else}
		<a class="details" {href}>{@render details()}</a>
	{/if}

	<Popover>
		{#snippet toggle()}
			<button class="reset toggle" aria-label={text('office.actions', { name: item.name })}>
				<Icon i="ellipsis-vertical" />
			</button>
		{/snippet}
		{#each actions as action (action.text)}
			<button class={['reset', 'menu-item', action.danger && 'danger']} onclick={() => action.action()}>
				<Icon i={action.i!} />
				<span>{action.text}</span>
			</button>
		{/each}
	</Popover>

	{#if sharing}
		<AccessControlDialog bind:dialog={shareDialog} {item} itemType="storage" {user} onclose={() => (sharing = false)} />
	{/if}
</div>

<style>
	.DocumentCard {
		position: relative;
		border-radius: 1em;
		border: var(--border-alt);
		background-color: var(--bg-alt);

		&:hover {
			background-color: var(--bg-accent);
		}
	}

	.details {
		display: grid;
		justify-items: start;
		gap: 0.25em;
		padding: 1em;
		padding-right: 2.5em;
		color: inherit;
		text-decoration: none;
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: bold;

		&.editing {
			overflow: visible;
		}
	}

	.subtle {
		font-size: 0.85em;
	}

	.toggle {
		position: absolute;
		top: 0.75em;
		right: 0.75em;
		padding: 0.25em 0.5em;
		border-radius: 0.5em;

		&:hover {
			background-color: var(--bg-strong);
		}
	}
</style>
