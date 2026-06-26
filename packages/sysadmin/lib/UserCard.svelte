<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { contextMenu, type ContextMenuItem } from '@axium/client/attachments';
	import { Icon, Popover } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import { toastStatus } from '@axium/client/toast';
	import type { SystemUser } from '@axium/sysadmin';
	import UserInitDialog from './UserInitDialog.svelte';

	let {
		user = $bindable(),
		edited,
		deleted,
	}: {
		user: SystemUser;
		/** Called with the updated user after an edit */
		edited?(user: SystemUser): unknown;
		/** Called after the user is deleted */
		deleted?(user: SystemUser): unknown;
	} = $props();

	let editDialog = $state<HTMLDialogElement>();

	const link = $derived(`/sysadmin/users/${user.id}`);

	function remove() {
		toastStatus(
			fetchAPI('DELETE', 'sysadmin/users/:id', {}, user.id).then(() => deleted?.(user)),
			text('sysadmin.UserCard.toast_deleted')
		);
	}

	/** The actions shown in both the hover popover and the right-click context menu. */
	const menuItems = (): ContextMenuItem[] => [
		{ i: 'pen', text: text('sysadmin.UserCard.edit'), action: () => editDialog!.showModal() },
		{ i: 'link-horizontal', text: text('sysadmin.UserCard.copy_link'), action: () => copy('text/plain', link) },
		{ i: 'arrow-up-right-from-square', text: text('sysadmin.UserCard.open_new_tab'), action: () => window.open(link) },
		{ i: 'trash', text: text('generic.delete'), danger: true, action: remove },
	];
</script>

<div class="UserCard" {@attach contextMenu(menuItems)}>
	<a class="link" href={link}>
		<Icon i="user" class="icon" --size="2em" />
		<div class="info">
			<span class="name">{user.name}</span>
			<span class="subtle username">{user.username}</span>
		</div>
	</a>

	<Popover showToggle="hover">
		{#each menuItems() as item}
			<div class={['menu-item', item.danger && 'danger']} onclick={item.action}>
				<Icon i={item.i!} />
				<span>{item.text}</span>
			</div>
		{/each}
	</Popover>
</div>

<UserInitDialog
	bind:dialog={editDialog}
	{user}
	edited={updated => {
		user = updated;
		edited?.(updated);
	}}
/>

<style>
	.UserCard {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 1em;
		border-radius: 0.5em;
		background-color: var(--bg-alt);
	}

	.link {
		display: flex;
		align-items: center;
		gap: 1em;
		flex: 1;
		min-width: 0;
		cursor: pointer;
		text-decoration: none;
		color: inherit;
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: bold;
	}

	.username {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
