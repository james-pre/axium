<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { contextMenu, type ContextMenuItem } from '@axium/client/attachments';
	import { Icon, Popover } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import { toastStatus } from '@axium/client/toast';
	import { systemTypeIcons, type System } from '@axium/sysadmin';
	import SystemInitDialog from './SystemInitDialog.svelte';

	let {
		system = $bindable(),
		online,
		edited,
		deleted,
	}: {
		system: System;
		online: boolean;
		/** Called with the updated system after an edit */
		edited?(system: System): unknown;
		/** Called after the system is deleted */
		deleted?(system: System): unknown;
	} = $props();

	let editDialog = $state<HTMLDialogElement>();

	const link = $derived(`/sysadmin/systems/${system.id}`);

	function remove() {
		toastStatus(
			fetchAPI('DELETE', 'sysadmin/systems/:id', {}, system.id).then(() => deleted?.(system)),
			text('sysadmin.SystemCard.toast_deleted')
		);
	}

	/** The actions shown in both the hover popover and the right-click context menu. */
	const menuItems = (): ContextMenuItem[] => [
		{ i: 'pen', text: text('sysadmin.SystemCard.edit'), action: () => editDialog!.showModal() },
		{ i: 'link-horizontal', text: text('sysadmin.SystemCard.copy_link'), action: () => copy('text/plain', link) },
		{
			i: 'arrow-up-right-from-square',
			text: text('sysadmin.SystemCard.open_new_tab'),
			action: () => window.open(`/sysadmin/systems/${system.id}`),
		},
		{ i: 'trash', text: text('generic.delete'), danger: true, action: remove },
	];
</script>

<div class="SystemCard" {@attach contextMenu(menuItems)}>
	<span class={['indicator', online ? 'online' : 'offline']} title={online ? text('sysadmin.online') : text('sysadmin.offline')}></span>
	<a class="link" href="/sysadmin/systems/{system.id}">
		<Icon i={systemTypeIcons[system.type]} class="icon" --size="2em" />
		<div class="info">
			<span class="name">{system.name}</span>
			<span class="subtle hostname">{system.hostname}</span>
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

<SystemInitDialog
	bind:dialog={editDialog}
	{system}
	edited={updated => {
		system = updated;
		edited?.(updated);
	}}
/>

<style>
	.SystemCard {
		position: relative;
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

	.indicator {
		position: absolute;
		top: 0.6em;
		left: 0.6em;
		width: 0.6em;
		height: 0.6em;
		border-radius: 50%;

		&.online {
			background-color: var(--green);
		}

		&.offline {
			background-color: hsl(0 0 calc(var(--fg-light) - 30));
		}
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

	.hostname {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
