<script lang="ts">
	import type { User } from '@axium/core';
	import { permissionNames, type AccessControllable } from '@axium/core/access';
	import type { Entries } from 'utilium';
	import FormDialog from './FormDialog.svelte';
	import UserCard from './UserCard.svelte';

	let {
		item = $bindable(),
		editable,
		dialog = $bindable(),
	}: { item: Required<AccessControllable> & { name?: string; user: User }; editable: boolean; dialog?: HTMLDialogElement } = $props();

	const permEntries = Object.entries(permissionNames) as any as Entries<typeof permissionNames>;

	const publicPerm = $derived(permissionNames[item.publicPermission]);
</script>

<FormDialog bind:dialog submitText="Save">
	{#snippet header()}
		{#if item.name}
			<h3>Permissions for <strong>{item.name}</strong></h3>
		{:else}
			<h3>Permissions</h3>
		{/if}
	{/snippet}

	<div class="AccessControl">
		<UserCard user={item.user} />
		<span>Owner</span>
	</div>

	{#each item.acl as control}
		<div class="AccessControl">
			{#if !control.user}<i>Unknown</i>
			{:else}
				<UserCard user={control.user} />
				{#if editable}
					<input type="hidden" name="userId" value={control.user.id} />
					<select name="permission">
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
		{#if editable}
			<select name="publicPermission">
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
