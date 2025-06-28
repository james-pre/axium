<script lang="ts">
	import { UserCard } from '@axium/server/web';
	import type { Permission, Share } from '@axium/shares';
	import { permissionNames } from '@axium/shares';
	import type { Entries } from 'utilium';

	const { share, editable }: { share: Share; editable: boolean } = $props();

	const perm = $derived(permissionNames[share.permission as Permission]);

	const permEntries = Object.entries(permissionNames) as any as Entries<typeof permissionNames>;
</script>

<div class="Share">
	{#if !share.user}<i>Unknown</i>
	{:else}
		<UserCard user={share.user} />
		{#if editable}
			<input type="hidden" name="userId" value={share.user.id} />
			<select name="permission">
				{#each permEntries as [key, name]}
					<option value={key} selected={key == share.permission}>{name}</option>
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
