<script lang="ts">
	import UserCard from './UserCard.svelte';
	import type { Permission, AccessControl } from '@axium/core/access';
	import { permissionNames } from '@axium/core/access';
	import type { Entries } from 'utilium';

	const { control, editable }: { control: AccessControl; editable: boolean } = $props();

	const perm = $derived(permissionNames[control.permission as Permission]);

	const permEntries = Object.entries(permissionNames) as any as Entries<typeof permissionNames>;
</script>

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
			<span>{perm}</span>
		{/if}
	{/if}
</div>

<style>
	.Share {
		display: flex;
		gap: 1em;
		padding: 1em 2em;
	}
</style>
