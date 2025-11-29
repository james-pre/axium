<script lang="ts">
	import type { AccessMap, User } from '@axium/core';
	import { permissionNames, type AccessControllable, type AccessControl } from '@axium/core/access';
	import type { Entries } from 'utilium';
	import FormDialog from './FormDialog.svelte';
	import UserCard from './UserCard.svelte';
	import { userInfo } from '@axium/client/user';
	import { getACL, setACL } from '@axium/client/access';

	interface Props {
		editable: boolean;
		dialog?: HTMLDialogElement;
		itemType: string;
		item?: ({ name?: string; user?: User; id: string } & AccessControllable) | null;
		acl?: AccessControl[];
	}
	let { item = $bindable(), itemType, editable, dialog = $bindable(), acl = $bindable(item?.acl) }: Props = $props();

	if (!acl && item) getACL(itemType, item.id).then(fetched => (acl = item.acl = fetched));

	const permEntries = Object.entries(permissionNames) as any as Entries<typeof permissionNames>;

	const publicPerm = $derived(permissionNames[item?.publicPermission || 0]);
</script>

<FormDialog
	bind:dialog
	submitText="Save"
	submit={async data => {
		if (item) await setACL(itemType, item.id, data as any as AccessMap);
	}}
>
	{#snippet header()}
		{#if item?.name}
			<h3>Permissions for <strong>{item.name}</strong></h3>
		{:else}
			<h3>Permissions</h3>
		{/if}
	{/snippet}

	<div class="AccessControl">
		{#if item?.user}
			<UserCard user={item.user} />
		{:else if item}
			{#await userInfo(item.userId) then user}<UserCard {user} />{/await}
		{/if}
		<span>Owner</span>
	</div>

	{#each acl ?? [] as control}
		<div class="AccessControl">
			{#if !control.user}<i>Unknown</i>
			{:else}
				<UserCard user={control.user} />
				{#if editable}
					<select name={control.userId}>
						{#each permEntries as [key, name]}
							<option value={key} selected={key == control.permission}>{name}</option>
						{/each}
					</select>
				{:else}
					<span>{permEntries[control.permission]}</span>
				{/if}
			{/if}
		</div>
	{/each}

	<div class="AccessControl public">
		<strong>Public Access</strong>
		{#if editable && item}
			<select name="public">
				{#each permEntries as [key, name]}
					<option value={key} selected={key == item.publicPermission}>{name}</option>
				{/each}
			</select>
		{:else}
			<span>{publicPerm}</span>
		{/if}
	</div>
</FormDialog>

<style>
	.AccessControl {
		display: grid;
		gap: 1em;
		grid-template-columns: 1fr 10em;
		min-width: 30em;
		padding: 1em 2em;

		&:not(.public) {
			border-bottom: 1px solid var(--border-accent);
		}
	}
</style>
